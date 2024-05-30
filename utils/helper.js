const Plan = require("../models/Plan");
const Customer = require("../models/Customer");
const Transaction = require("../models/Transaction");
const Invoice = require("../models/Invoice");
const { descriptions } = require("./constants");


const findPlanById = async (session, planId) => {
    try {
        return await Plan.findById(planId).session(session);
    } catch (error) {
        console.error('Error finding plan:', error);
        throw new Error('Error finding plan');
    }
};

const findCustomerById = async (session, customerId) => {
    try {
        return await Customer.findById(customerId).session(session);
    } catch (error) {
        console.error('Error finding customer:', error);
        throw new Error('Error finding customer');
    }
};

const findCurrentActivePlan = async(session, customerId)=>{
    try {
        const customerPlan = await Customer.findOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            { 'pricingPlans.$': 1 },
            { session }
        );

        if (customerPlan && customerPlan.pricingPlans.length > 0) {
            return customerPlan.pricingPlans[0];
        } else {
            return null;
        }
    } catch (error) {
        throw error;
    }
}

const isActivePlan = async(session, customerId)=>{
    try {
        const customerPlan = await Customer.findOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            { 'pricingPlans.$': 1 },
            {session}
        );

        if (customerPlan && customerPlan.pricingPlans.length > 0) {
            return true;
        } 
        return false;
    } catch (error) {
        console.error('Error finding plan:', error);
        throw new Error('Something went wrong');
    }
}


const billGeneration = async (session, customerId) => {   
    try {

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer not found')
        }


        let criteria = {
            customerId: customerId,
            status: 'unbilled'
        };

        const transactions = await Transaction.find(criteria).session(session);

        if (transactions.length > 0) {
            const totalAmount = transactions.reduce((acc, transaction) => acc + (transaction.details.amount || 0), 0);
            const totalPrice = transactions.reduce((acc, transaction) => acc + (transaction.details.price || 0), 0);
            const totalTax = transactions.reduce((acc, transaction) => acc + (transaction.details.calculatedTax || 0), 0);
    
            const lineItems = transactions.map(transaction => ({
                description: transaction.type,
                amount: transaction.details.price
            }));
    
            lineItems.push({
                description: 'Tax (18%)',
                amount: totalTax,
            });
    
            const invoiceData= {
                customerId: customerId,
                totalAmount,
                totalPrice,
                totalTax,
                lineItems
            };
    
            await createInvoice(session, invoiceData);
            await billTransactions(session, criteria);
            const data = {
                customerId,
                amount: totalAmount
            }
            await updateOutstandingBalance(session, data);    
        }
    } catch (error) {
        console.error(`'Error generating invoice: ${error.message}`);
        throw new Error(`'Error generating invoice: ${error.message}`)
    }
}

const calculateProration = (currentDate, proRatedEndDate, plan) => {
    if(plan.type=='Package')
    {
        const quotaValidityInDays = plan.quotaValidity === 'monthly' ? 30 : 365;   
        const oneDay = 24 * 60 * 60 * 1000;
        const daysInPeriod = Math.round(Math.abs((proRatedEndDate - currentDate) / oneDay));
        
        const dailyCost = plan.price / quotaValidityInDays;
        const dailyInterviews = plan.interviewsPerQuota / quotaValidityInDays;
        
        const proRatedPrice = Math.round(dailyCost * daysInPeriod);
        const proRatedInterviews = Math.round(dailyInterviews * daysInPeriod);
        return {
            proRatedPrice,
            proRatedInterviews
        };
    }
};

const createNewPackagePlan = async (session, customerId, plan, renewalDate, isProRated) => {
    try
    {
        const customer = await Customer.findById(customerId).session(session);
        const date = new Date();
        const newCustomerPlan = {
            planId: plan._id,
            startDate: date,
            endDate: null,
            type: 'Package',
            isActive: true,
            details: {
                name: plan.name,
                price: plan.price,
                interviewsPerQuota: plan.interviewsPerQuota,
                interviewRate: plan.interviewRate,
                additionalInterviewRate: plan.additionalInterviewRate,
                interviewsUsed: 0,
                quotaValidity: plan.quotaValidity,
            },
            renewalDate,
            isProRated
        };
        console.log(newCustomerPlan);
    
        customer.pricingPlans.push(newCustomerPlan);
        await customer.save({ session });
    }
    catch(error)
    {
        console.log(error);
        throw new Error('Error in creating the Package')
    }
    
}

const createNewPayAsYouGoPlan = async (session, customerId, plan, renewalDate) => {
    try
    {
        const customer = await Customer.findById(customerId).session(session);
        const date = new Date(); 
        const newCustomerPlan = {
            planId: plan._id,
            startDate: date,
            endDate: null,
            type: 'PayAsYouGo',
            isActive: true,
            details: {
                name: plan.name,
                interviewRate: customer.interviewRate || plan.interviewRate,
            },
            renewalDate,
        };
    
        customer.pricingPlans.push(newCustomerPlan);
        await customer.save({ session });    
    }
    catch(error)
    {
        throw new Error('Error while creating the PayAsYouGo')
    }
}

const calculateRenewalDate = (startDate, quotaValidity) => {
    const renewalDate = new Date(startDate);
    if (quotaValidity === 'monthly') {
        renewalDate.setMonth(renewalDate.getMonth() + 1);
    } else if (quotaValidity === 'yearly') {
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    }
    return renewalDate;
};

const deactiveCurrentPlan = async (customerId, session) => {
    try
    {
        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            { $set: 
                { 
                    'pricingPlans.$.isActive': false
                } 
            },
            { session }
        );
    }
    catch(error)
    {
        throw new Error('Error while deactivating current plan')
    }

}

const createNewPayAsYouGoPlanCustomRate = async (session, customerId, plan, renewalDate) => {
    try
    {
        const customer = await Customer.findById(customerId).session(session);
        const date = new Date(); 
        const newCustomerPlan = {
            planId: plan._id,
            startDate: date,
            endDate: null,
            type: 'PayAsYouGo',
            isActive: true,
            details: {
                name: plan.name,
                interviewRate: plan.interviewRate,
            },
            renewalDate,
        };
    
        customer.pricingPlans.push(newCustomerPlan);
        await customer.save({ session });    
    }
    catch(error)
    {
        throw new Error('Error while creating the PayAsYouGo')
    }
}

const createPackagePlan = async(session, data)=>{
    try
    {
        const plan = new Plan({
            'name': data.name,
            'price': data.price,
            'type': 'Package',
            'additionalInterviewRate': data.additionalInterviewRate,
            'quotaValidity': data.quotaValidity,
            'interviewsPerQuota': data.interviewsPerQuota,
        });
    
        await plan.save({session});
    }
    catch(error)
    {
        throw new Error('Unable to create package')
    }


}

const createPayAsYouGoPlan = async(session, data)=>{
    try
    {
        const plan = new Plan({
            'name': data.name,
            'type': 'PayAsYouGo',
            'interviewRate': data.interviewRate
        });
    
        await plan.save({session});
    }
    catch(error)
    {
        throw new Error('Unable to create package')
    }


}

const createInvoice = async (session, data)=>{
    try
    {
    
        const newInvoice = new Invoice({
            'customerId': data.customerId,
            'issuedDate': new Date(),
            'dueDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            'totalAmount': data.totalAmount,
            'totalPrice': data.totalPrice,
            'totalTax': data.totalTax,
            'currency': 'INR',
            'status': data.status || 'unpaid',
            'lineItems': data.lineItems
        });

        await newInvoice.save({session});
    }
    catch(error)
    {
        console.error(`Error in function createInvoice in file ${__filename}:`, error);
        throw new Error(`Something went wrong while creating invoice`)
    }
}

const billTransactions = async (session, data)=>{
    try
    {
        const  {
            customerId,
            status
        } = data

        await Transaction.updateMany(
            {customerId, status}, 
            { $set: { status: 'billed' }},
            {session} 
        );
    }
    catch(error)
    {
        console.error(`Error in function billTransactions in file ${__filename}:`, error);
        throw new Error(`Something went wrong updating transactions`)
    }



}

const updateOutstandingBalance = async (session, data) => {
    try
    {
        const {
            customerId,
            amount
        } = data
        await Customer.updateOne(
            { _id: customerId},
            { $inc: {'outstandingBalance': amount}
            },
            { session }
        );
    }
    catch(error)
    {
        console.log(error.message)
        throw new Error('Unable to update the outstading balance');
    }

}

const markInvoicesPaid = async (session, customerId)=>{
    try
    {
        await Invoice.updateMany(
            { customerId: customerId, status: 'unpaid' }, 
            { $set: { status: 'paid' } },
            {session},
        );

    }
    catch(error)
    {
        console.log(`Error while marking invoices paid`)
        throw new Error('Error while Marking the invoices as paid');
    }
    
}

const renewPackagePlan = async (session, customerId ,activePlan) =>{
    try
    {
        const customer = await findCustomerById(session, customerId);
        if(!customer)
        {
            throw new Error('Customer not found');
        }

        const plan = await findPlanById(session, activePlan.planId);
        if(!plan)
        {
            throw new Error('Plan not found');
        }

        const currentDate = new Date();
        const renewalDate = new Date(activePlan.renewalDate);

        if (renewalDate > currentDate) {
            throw new Error('Renewal date is in the future, plan cannot be renewed yet')
        }


        const newRenewalDate = calculateRenewalDate(renewalDate, activePlan.details.quotaValidity);
        
      
        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.details.interviewsUsed': 0,
                    'pricingPlans.$.details.additionalInterviewsUsed': 0,
                    'pricingPlans.$.renewalDate': newRenewalDate
                }
            }, 
            {session},
        );

        if(customer.paymentType=='Postpaid')
        {
            await billGeneration(session, customerId);
        }

        let note = `Package Renewal of ${plan.name}`
        note = `${getNotes('PackageRenewal')} ${plan.name}`;
        await handleTransactionPayment(session, customerId, plan.price, 'PackageRenewal', note);
        
        if(customer.paymentType=='Prepaid')
        {
            await billGeneration(session, customerId);
        }
    }
    catch(error)
    {
        console.log(error.message);
        throw new Error(error.message);
    }
}

const renewProRatedPackagePlan = async (session, customerId, activePlan)=>{
    try
    {
        const customer = await findCustomerById(session, customerId);
        if(!customer)
        {
            throw new Error('Customer not found');
        }

        const plan = await findPlanById(session, activePlan.planId);
        if(!plan)
        {
            throw new Error('Plan not found');
        }

        const date = new Date();

        if(customer.paymentType=='Postpaid')
        {
            await billGeneration(session, customerId);
        }

        note = `Package Renewal of ${plan.name}`
        note = `${getNotes('PackageRenewal')} ${plan.name}`;
        await handleTransactionPayment(session, customerId, plan.price, 'PackageRenewal', note);
        
        if(customer.paymentType=='Prepaid')
        {
            await billGeneration(session, customerId);
        }

        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.isActive': false,
                    'pricingPlans.$.endDate': new Date(),
                }
            },
            {session}
        );

        const renewalDate = calculateRenewalDate(date, plan.quotaValidity); 
        await createNewPackagePlan(session, customerId, plan, renewalDate, false);
    }
    catch(error)
    {
        throw new Error('Error in renew a proRated Package Plan')
    }
}

const renewProRatedPayAsYouGoPlan = async (session, customerId, activePlan)=>{
    try
    {
        const customer = await findCustomerById(session, customerId);
        if(!customer)
        {
            throw new Error('Customer not found');
        }

        const plan = await findPlanById(session, activePlan.planId);
        if(!plan)
        {
            throw new Error('Plan not found');
        }

        const date = new Date();
        await billGeneration(session, customerId);

        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.isActive': false,
                    'pricingPlans.$.endDate': new Date(),
                }
            },
            {session}
        );

        const renewalDate = calculateRenewalDate(date, "monthly");
        await createNewPayAsYouGoPlan(session, customerId, plan, renewalDate, false)
    }
    catch(error)
    {
        throw new Error('Error in renewing the payAsYouGo plan')
    }
}


const changePlan = async(session, customerId, currentPlan) =>{

    try
    {
        const customer = await findCustomerById(session, customerId);
        if(!customer)
        {
            throw new Error('Customer not found');
        }

        const plan = await findPlanById(session, currentPlan.planId);
        if(!plan)
        {
            throw new Error('Plan not found');
        }

        const changePlan = await findPlanById(session, customer.changePlanRequest.planId);
        if(!changePlan)
        {
            throw new Error('Plan not found');
        }

        let note = ''

        if(currentPlan.type == 'Package')
        {
            const currentDate = new Date();
            const renewalDate = new Date(currentPlan.renewalDate);

            if (renewalDate > currentDate) {
                throw new Error ("Renewal date is in the future, plan cannot be renewed yet");
            }
            if(changePlan.type == 'Package')
            {
                await changePlanFromPackageToPackage(session, customer, plan, changePlan)
            }
            if(changePlan.type == 'PayAsYouGo')
            {
                await changePlanFromPackageToPayAsYouGo(session, customer, plan, changePlan)
            }
            
        }
        if(currentPlan.type == 'PayAsYouGo')
        {
            if(changePlan.type=='Package')
            {
                await changePlanFromPayAsYouGoToPackage(session, customer, currentPlan, changePlan) 
            }
        }

    }
    catch(error)
    {
        throw new Error('Something went wrong here');
    }
}

const changePlanFromPackageToPackage = async(session, customer, currentPlan, changePlan) => {
    try
    {
        const customerId = customer._id
        if(customer.paymentType=='Postpaid')
        {
            await billGeneration(session, customerId);
        }
        
        // note = `Change Plan from ${currentPlan.name} to ${changePlan.name}`
        note = `${getNotes('ChangePlan')} ${changePlan.name}`;
        await handleTransactionPayment(session, customerId, changePlan.price, 'ChangePlan', note)

        if(customer.paymentType=='Prepaid')
        {
            await billGeneration(session, customerId);
        }

        const date = new Date();
        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            { 
                $set: { 
                'pricingPlans.$.isActive': false,
                'pricingPlans.$.endDate': new Date(),
            }
            },
            {session}
        );

        const renewalDate = calculateRenewalDate(date, changePlan.quotaValidity)
        await createNewPackagePlan(session, customerId, changePlan, renewalDate, false);
        await Customer.updateOne(
            { _id: customerId, 'changePlanRequest.isActive': true },
            { $set: { 'changePlanRequest.isActive': false } },
            { session }
        );
    }
    catch(error)
    {
        throw new Error('In change Package')
    }
}

const changePlanFromPackageToPayAsYouGo = async(session, customer, currentPlan, changePlan)=>{
    try
    {
        const customerId = customer._id;
        await billGeneration(sesssion, customerId);
        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            { $set: { 
                'pricingPlans.$.isActive': false,
                'pricingPlans.$.endDate': new Date(),
            }
            },
            { session }
        );



        const renewalDate = calculateRenewalDate(date, "monthly");
        await createNewPayAsYouGoPlan(session, customerId, changePlan, renewalDate, false)

        await Customer.updateOne(
            { _id: customerId, 'changePlanRequest.isActive': true },
            { $set: { 'changePlanRequest.isActive': false } },
            { session }
        );
       
    }
    catch(error)
    {
        throw new Error('Error in changePlanFromPackageToPayAsYouGo')
    }
}

const changePlanFromPayAsYouGoToPackage = async(session, customer, currentPlan, changePlan)=>{
    try
    {
        const customerId = customer._id
        if(customer.paymentType=='Postpaid')
        {
            await billGeneration(session, customerId);
        }
        
        // note = `Change Plan from ${currentPlan.name} to ${changePlan.name}`
        note = `${getNotes('ChangePlan')} ${changePlan.name}`;
        await handleTransactionPayment(session, customerId, changePlan.price, 'ChangePlan', note)

        if(customer.paymentType=='Prepaid')
        {
            await billGeneration(session, customerId);
        }

        const date = new Date();
        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            { 
                $set: { 
                'pricingPlans.$.isActive': false,
                'pricingPlans.$.endDate': new Date(),
            }
            },
            {session}
        );

        const renewalDate = calculateRenewalDate(date, changePlan.quotaValidity)
        
        await createNewPackagePlan(session, customerId, changePlan, renewalDate, false);
        
        await Customer.updateOne(
            { _id: customerId, 'changePlanRequest.isActive': true },
            { $set: { 'changePlanRequest.isActive': false } },
            { session }
        );
    }
    catch(error)
    {
        throw new Error('In change Package')
    }
}

const handleTransactionPayment = async (session, customerId, amount , transactionType , note) => {
    try {
        console.log(`Handling payment for customer ID: ${customerId} at price: ${amount}`);

        // Fetch the customer details from the database
        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            console.log('Customer not found during payment processing');
            throw new Error('Customer Not Found');
        }

        // Calculate the tax and total amount for the transaction
        const taxRate = customer.tax;
        const price = parseInt(amount);
        const taxAmount = Math.ceil((price * taxRate) / 100);
        const totalAmount = price + taxAmount;

        // Initialize balance variables
        let currentBalance = customer.currentBalance;
        let beforeUpdateCurrentBalance = currentBalance;
        let afterUpdateCurrentBalance;

        console.log(`Current balance before transaction: ${currentBalance}`);

        // Default transaction status
        let status = 'unbilled';

        // Case 1: Customer's current balance is sufficient to cover the total amount
        if (currentBalance >= totalAmount) {
            currentBalance -= totalAmount;
            afterUpdateCurrentBalance = currentBalance;
            status = 'completed';

            // Create a transaction with status 'completed'
            await createTransaction(
                session,
                customerId,
                transactionType,
                status,
                {
                    price: price,
                    tax: taxRate,
                    calculatedTax: taxAmount,
                    amount: totalAmount,
                    note
                },
                beforeUpdateCurrentBalance,
                afterUpdateCurrentBalance,
                'debit'
            );

        // Case 2: Customer's current balance is partially sufficient
        } else if (currentBalance > 0) {
            // Calculate the amount still due after using the current balance
            let remainingAmountDue = totalAmount - currentBalance;

            // Calculate the net price and tax covered by the current balance
            let netPriceCoveredByBalance = Math.ceil(currentBalance / (1 + taxRate / 100));
            let taxCoveredByBalance = currentBalance - netPriceCoveredByBalance;

            // Create a transaction for the portion covered by the current balance
            await createTransaction(
                session,
                customerId,
                transactionType,
                'completed',
                {
                    price: netPriceCoveredByBalance,
                    tax: taxRate,
                    calculatedTax: taxCoveredByBalance,
                    amount: currentBalance,
                    note
                },
                beforeUpdateCurrentBalance,
                0,
                'debit'
            );

            // Update the balances for the next transaction
            beforeUpdateCurrentBalance = 0;
            afterUpdateCurrentBalance = -remainingAmountDue;

            // Calculate the remaining net price and tax to be billed
            let netPriceRemaining = Math.ceil(remainingAmountDue / (1 + taxRate / 100));
            let taxRemaining = remainingAmountDue - netPriceRemaining;

            // Create a transaction for the remaining amount to be billed
            await createTransaction(
                session,
                customerId,
                transactionType,
                'unbilled',
                {
                    price: netPriceRemaining,
                    tax: taxRate,
                    calculatedTax: taxRemaining,
                    amount: remainingAmountDue,
                    note
                },
                0,
                afterUpdateCurrentBalance,
                'debit'
            );

        // Case 3: Customer's current balance is insufficient to cover any part of the total amount
        } else {
            afterUpdateCurrentBalance = currentBalance - totalAmount;

            // Create a transaction with status 'unbilled'
            await createTransaction(
                session,
                customerId,
                transactionType,
                'unbilled',
                {
                    price: price,
                    tax: taxRate,
                    calculatedTax: taxAmount,
                    amount: totalAmount,
                    note
                },
                beforeUpdateCurrentBalance,
                afterUpdateCurrentBalance,
                'debit'
            );
        }
        
        // Update the customer's current balance in the database
        await Customer.findByIdAndUpdate(customerId, {
            $set: { currentBalance: afterUpdateCurrentBalance }
        }, { new: true, session });

        // Log the updated balance
        console.log(`Updated current balance after transaction: ${afterUpdateCurrentBalance}`);

    } catch (error) {
        console.error(`Error processing transaction: ${error.message}`);
        throw new Error(`Error processing transaction: ${error.message}`)
    }
};

const createTransaction = async (session, customerId, type, status, details, beforeUpdateCurrentBalance, afterUpdateCurrentBalance, transactionType) => {
    try {
            const date = new Date();
            const transaction = new Transaction({
                customerId: customerId,
                type: type,
                date: date,
                status: status,
                details: details,
                beforeUpdateCurrentBalance: beforeUpdateCurrentBalance || 0,
                afterUpdateCurrentBalance: afterUpdateCurrentBalance || 0,
                transactionType: transactionType,
            });

            await transaction.save({session });
            return transaction;
    } catch (error) {
        console.log("Error while creating the transaction")
        console.log(error.message)
        throw error;
    }
};


const consumePackage = async (session, customerId, activePlan) => {
    try
    {
        console.log(`Consuming package plan for customer ID: ${customerId}`);
        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            throw new Error('Customer not found');
        }
    
        const { interviewsUsed, interviewsPerQuota, additionalInterviewRate } = activePlan.details;
        if (interviewsUsed < interviewsPerQuota) {
            console.log(`Interviews used (${interviewsUsed}) is less than per quota limit (${interviewsPerQuota}) for customer ID: ${customerId}`);
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                { $inc: { 'pricingPlans.$.details.interviewsUsed': +1 } },
                { session }
            );        
        } else {

            console.log(`Interviews used exceeds per quota limit for customer ID: ${customerId}, charging additional rate`);
            const price = additionalInterviewRate;
            let note = `Additional Interview Charge @ ${price}`
            note = getNotes('AdditionalInterviewCharge')
            await handleTransactionPayment(session, customerId, price, 'AdditionalInterviewCharge', note);
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                { $inc: { 'pricingPlans.$.details.additionalInterviewsUsed': +1 } },
                { session }
            );
        }
    }
    catch(error)
    {
        console.log(error);
        throw new Error('Somehting went wrong');
    }
    
}

const consumePayAsYouGo = async (session, customerId, activePlan) => {
    try
    {
        const price = activePlan.details.interviewRate;
        console.log(`Consuming PayAsYouGo plan for customer ID: ${customerId} at rate ${price}`);
        let note = `Charge of Interview @ ${price}`
        note = getNotes('InterviewCharge')
        await handleTransactionPayment(session, customerId, price , "InterviewCharge", note);
    
    }
    catch(error)
    {
        throw new Error('Something went wrong')
    }

}


const bonusTopUp = async (session, customerId, amount)=> {
    try
    {
        await billGeneration(session, customerId);
    
        const customer = await Customer.findById(customerId);
        if (!customer) {
            throw new Error('Customer Not Found');
        }
    
        const bonusAmount = parseInt(amount);
    
        if (customer.outstandingBalance > 0) {
            if (bonusAmount < customer.outstandingBalance) {
                throw new Error('Bonus amount must be equal to or greater than the outstanding balance')
            }
            
            if (bonusAmount >= customer.outstandingBalance) {
                customer.outstandingBalance = 0;
                await markInvoicesPaid(session, customerId)
    
            }
        }
    
        let beforeUpdateCurrentBalance = customer.currentBalance;
        customer.currentBalance += bonusAmount;
        let afterUpdateCurrentBalance = customer.currentBalance;


        let note = `Bonus of ${bonusAmount} is given`; 
        note = getNotes('Bonus');
        await createTransaction(
            session,
            customerId,
            'Bonus',
            'promo_credit',
            {
                price: bonusAmount,
                tax: 0,
                calculatedTax: 0,
                amount: bonusAmount,
                note
            },
            beforeUpdateCurrentBalance,
            afterUpdateCurrentBalance,
            'credit'
        );

        await Customer.updateOne(
            {_id: customerId},
            {$inc: {'currentBalance': bonusAmount}},
            { session }
        );
    }
    catch(error)
    {
        console.log(`Error in topup ${error.message}`);
        throw new Error(error.message)
    }
}

const getNotes = (transactionType)=>{
    return descriptions[transactionType] || "";
}

const changeInterViewRate = async(session, customerId, interviewRate) =>{
    try
    {
        const customer = await findCustomerById(session, customerId);
        if (!customer)
        {
            throw new Error('Customer Not Found');
        }
    
        const activePlan = await findCurrentActivePlan(session, customerId);
        if(!activePlan)
        {
            console.log("No active plan found for the customer, skipping interview rate update.");
            return;  
        }
        if(activePlan.type=='PayAsYouGo')
        {
    
            if(activePlan.interviewRate == interviewRate)
            {
                console.log("Same interview rate is there");
                return; 
            }
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                { $set: 
                    { 
                        'pricingPlans.$.isActive': false,
                        'pricingPlans.$.endDate': new Date(),
                    } 
                },
                { session }
            );
    
            const date = new Date(); 
            const newCustomerPlan = {
                planId: activePlan._id,
                startDate: date,
                endDate: null,
                type: 'PayAsYouGo',
                isActive: true,
                details: {
                    name: activePlan.name,
                    interviewRate: interviewRate,
                },
                renewalDate: activePlan.renewalDate,
            };
        
            customer.pricingPlans.push(newCustomerPlan);
            await customer.save({session});    
        }
    }
    catch(error)
    {
        console.log(error)
        throw new Error(error.message);
    }

}

module.exports = { 
    findPlanById, 
    findCustomerById, 
    createTransaction, 
    findCurrentActivePlan,
    isActivePlan,
    billGeneration,
    calculateProration,
    createNewPackagePlan,
    createNewPayAsYouGoPlan,
    calculateRenewalDate,
    deactiveCurrentPlan,
    createPackagePlan,
    createPayAsYouGoPlan,
    markInvoicesPaid,
    createInvoice,
    changePlan,
    renewPackagePlan,
    renewProRatedPackagePlan,
    renewProRatedPayAsYouGoPlan,
    handleTransactionPayment,
    consumePayAsYouGo,
    consumePackage,
    bonusTopUp,
    getNotes,
    changeInterViewRate

};
