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
        console.log(`Starting bill generation for customer ID: ${customerId}`);

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            console.error(`Customer not found for ID: ${customerId}`);
            throw new Error('Customer not found');
        }

        let criteria = {
            customerId: customerId,
            status: 'unbilled'
        };

        const transactions = await Transaction.find(criteria).session(session);
        console.log(`Found ${transactions.length} unbilled transactions for customer ID: ${customerId}`);

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

            const invoiceData = {
                customerId: customerId,
                totalAmount,
                totalPrice,
                totalTax,
                lineItems
            };

            await createInvoice(session, invoiceData);
            console.log(`Invoice created for customer ID: ${customerId} with total amount: ${totalAmount}`);
            await billTransactions(session, criteria);
            const data = {
                customerId,
                amount: totalAmount
            };
            await updateOutstandingBalance(session, data);
            console.log(`Updated outstanding balance for customer ID: ${customerId} by amount: ${totalAmount}`);
        }
    } catch (error) {
        console.error(`Error generating invoice: ${error.message}`);
        throw new Error(`Error generating invoice: ${error.message}`);
    }
};

const calculateProration = (currentDate, proRatedEndDate, plan) => {
    console.log(`Calculating proration for plan ID: ${plan._id}`);
    if (plan.type === 'Package') {
        const quotaValidityInDays = plan.quotaValidity === 'monthly' ? 30 : 365;
        const oneDay = 24 * 60 * 60 * 1000;
        const daysInPeriod = Math.round(Math.abs((proRatedEndDate - currentDate) / oneDay));

        const dailyCost = plan.price / quotaValidityInDays;
        const dailyInterviews = plan.interviewsPerQuota / quotaValidityInDays;

        const proRatedPrice = Math.round(dailyCost * daysInPeriod);
        const proRatedInterviews = Math.round(dailyInterviews * daysInPeriod);

        console.log(`Proration calculated: price = ${proRatedPrice}, interviews = ${proRatedInterviews}`);
        return {
            proRatedPrice,
            proRatedInterviews
        };
    }
};

const createNewPackagePlan = async (session, customerId, plan, renewalDate, isProRated) => {
    try {
        console.log(`Creating new package plan for customer ID: ${customerId} with plan ID: ${plan._id}`);
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
        console.log(`New package plan details: ${JSON.stringify(newCustomerPlan)}`);

        customer.pricingPlans.push(newCustomerPlan);
        await customer.save({ session });
        console.log(`Package plan saved for customer ID: ${customerId}`);
    } catch (error) {
        console.error(`Error creating package plan for customer ID: ${customerId}: ${error.message}`);
        throw new Error('Error in creating the Package');
    }
};

const createNewPayAsYouGoPlan = async (session, customerId, plan, renewalDate) => {
    try {
        console.log(`Creating new PayAsYouGo plan for customer ID: ${customerId} with plan ID: ${plan._id}`);
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
        console.log(`PayAsYouGo plan saved for customer ID: ${customerId}`);
    } catch (error) {
        console.error(`Error creating PayAsYouGo plan for customer ID: ${customerId}: ${error.message}`);
        throw new Error('Error while creating the PayAsYouGo');
    }
};

const calculateRenewalDate = (startDate, quotaValidity) => {
    console.log(`Calculating renewal date from start date: ${startDate} with quota validity: ${quotaValidity}`);
    const renewalDate = new Date(startDate);
    if (quotaValidity === 'monthly') {
        renewalDate.setMonth(renewalDate.getMonth() + 1);
    } else if (quotaValidity === 'yearly') {
        renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    }
    console.log(`Calculated renewal date: ${renewalDate}`);
    return renewalDate;
};

const deactiveCurrentPlan = async (customerId, session) => {
    try {
        console.log(`Deactivating current plan for customer ID: ${customerId}`);
        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            { $set: 
                { 
                    'pricingPlans.$.isActive': false
                } 
            },
            { session }
        );
        console.log(`Current plan deactivated for customer ID: ${customerId}`);
    } catch (error) {
        console.error(`Error deactivating current plan for customer ID: ${customerId}: ${error.message}`);
        throw new Error('Error while deactivating current plan');
    }
};

const createPackagePlan = async (session, data) => {
    try {
        console.log(`Creating package plan with data: ${JSON.stringify(data)}`);
        const plan = new Plan({
            name: data.name,
            price: data.price,
            type: 'Package',
            additionalInterviewRate: data.additionalInterviewRate,
            quotaValidity: data.quotaValidity,
            interviewsPerQuota: data.interviewsPerQuota,
        });

        await plan.save({ session });
        console.log(`Package plan created with ID: ${plan._id}`);
    } catch (error) {
        console.error(`Error creating package plan: ${error.message}`);
        throw new Error('Unable to create package');
    }
};

const createPayAsYouGoPlan = async (session, data) => {
    try {
        console.log(`Creating PayAsYouGo plan with data: ${JSON.stringify(data)}`);
        const plan = new Plan({
            name: data.name,
            type: 'PayAsYouGo',
            interviewRate: data.interviewRate
        });

        await plan.save({ session });
        console.log(`PayAsYouGo plan created with ID: ${plan._id}`);
    } catch (error) {
        console.error(`Error creating PayAsYouGo plan: ${error.message}`);
        throw new Error('Unable to create package');
    }
};

const createInvoice = async (session, data) => {
    try {
        console.log(`Creating invoice for customer ID: ${data.customerId} with total amount: ${data.totalAmount}`);
        const newInvoice = new Invoice({
            customerId: data.customerId,
            issuedDate: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            totalAmount: data.totalAmount,
            totalPrice: data.totalPrice,
            totalTax: data.totalTax,
            currency: 'INR',
            status: data.status || 'unpaid',
            lineItems: data.lineItems
        });

        await newInvoice.save({ session });
        console.log(`Invoice created with ID: ${newInvoice._id}`);
    } catch (error) {
        console.error(`Error in function createInvoice in file ${__filename}: ${error.message}`);
        throw new Error('Something went wrong while creating invoice');
    }
};

const billTransactions = async (session, data) => {
    try {
        const { customerId, status } = data;
        console.log(`Billing transactions for customer ID: ${customerId} with status: ${status}`);
        await Transaction.updateMany(
            { customerId, status }, 
            { $set: { status: 'billed' }},
            { session }
        );
        console.log(`Transactions updated to billed for customer ID: ${customerId}`);
    } catch (error) {
        console.error(`Error in function billTransactions in file ${__filename}: ${error.message}`);
        throw new Error('Something went wrong updating transactions');
    }
};

const updateOutstandingBalance = async (session, data) => {
    try {
        const { customerId, amount } = data;
        console.log(`Updating outstanding balance for customer ID: ${customerId} by amount: ${amount}`);
        await Customer.updateOne(
            { _id: customerId },
            { $inc: { outstandingBalance: amount } },
            { session }
        );
        console.log(`Outstanding balance updated for customer ID: ${customerId}`);
    } catch (error) {
        console.error(`Error updating outstanding balance for customer ID: ${customerId}: ${error.message}`);
        throw new Error('Unable to update the outstanding balance');
    }
};

const markInvoicesPaid = async (session, customerId) => {
    try {
        console.log(`Marking invoices as paid for customer ID: ${customerId}`);
        await Invoice.updateMany(
            { customerId: customerId, status: 'unpaid' }, 
            { $set: { status: 'paid' } },
            { session }
        );
        console.log(`Invoices marked as paid for customer ID: ${customerId}`);
    } catch (error) {
        console.error(`Error while marking invoices paid for customer ID: ${customerId}: ${error.message}`);
        throw new Error('Error while marking the invoices as paid');
    }
};


const renewPackagePlan = async (session, customerId, activePlan) => {
    try {
        console.log(`Renewing package plan for customer: ${customerId}, plan: ${activePlan.planId}`);

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        console.log(`Customer found: ${customer._id}`);

        const plan = await findPlanById(session, activePlan.planId);
        if (!plan) {
            throw new Error('Plan not found');
        }
        console.log(`Plan found: ${plan._id}`);

        const currentDate = new Date();
        const renewalDate = new Date(activePlan.renewalDate);

        if (renewalDate > currentDate) {
            throw new Error('Renewal date is in the future, plan cannot be renewed yet');
        }

        const newRenewalDate = calculateRenewalDate(renewalDate, activePlan.details.quotaValidity);
        console.log(`New renewal date calculated: ${newRenewalDate}`);

        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.details.interviewsUsed': 0,
                    'pricingPlans.$.details.additionalInterviewsUsed': 0,
                    'pricingPlans.$.details.interviewsPerQuota': plan.interviewsPerQuota,
                    'pricingPlans.$.details.additionalInterviewRate': plan.additionalInterviewRate,
                    'pricingPlans.$.renewalDate': newRenewalDate
                }
            },
            { session },
        );
        console.log(`Customer plan updated for customer: ${customerId}`);

        if (customer.paymentType == 'Postpaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for postpaid customer: ${customerId}`);
        }

        let note = `Package Renewal of ${plan.name}`;
        note = `${getNotes('PackageRenewal')} ${plan.name}`;
        await handleTransactionPayment(session, customerId, plan.price, 'PackageRenewal', note);
        console.log(`Transaction payment handled for customer: ${customerId}, plan: ${plan.name}`);

        if (customer.paymentType == 'Prepaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for prepaid customer: ${customerId}`);
        }
    } catch (error) {
        console.log(`Error renewing package plan for customer: ${customerId} - ${error.message}`);
        throw new Error(error.message);
    }
};

const renewProRatedPackagePlan = async (session, customerId, activePlan) => {
    try {
        console.log(`Renewing pro-rated package plan for customer: ${customerId}, plan: ${activePlan.planId}`);

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        console.log(`Customer found: ${customer._id}`);

        const plan = await findPlanById(session, activePlan.planId);
        if (!plan) {
            throw new Error('Plan not found');
        }
        console.log(`Plan found: ${plan._id}`);

        const date = new Date();

        if (customer.paymentType == 'Postpaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for postpaid customer: ${customerId}`);
        }

        let note = `Package Renewal of ${plan.name}`;
        note = `${getNotes('PackageRenewal')} ${plan.name}`;
        await handleTransactionPayment(session, customerId, plan.price, 'PackageRenewal', note);
        console.log(`Transaction payment handled for customer: ${customerId}, plan: ${plan.name}`);

        if (customer.paymentType == 'Prepaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for prepaid customer: ${customerId}`);
        }

        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.isActive': false,
                    'pricingPlans.$.endDate': new Date(),
                }
            },
            { session }
        );
        console.log(`Customer plan deactivated for customer: ${customerId}`);

        const renewalDate = calculateRenewalDate(date, plan.quotaValidity);
        await createNewPackagePlan(session, customerId, plan, renewalDate, false);
        console.log(`New package plan created for customer: ${customerId}`);
    } catch (error) {
        console.log(`Error renewing pro-rated package plan for customer: ${customerId} - ${error.message}`);
        throw new Error('Error in renew a proRated Package Plan');
    }
};

const renewProRatedPayAsYouGoPlan = async (session, customerId, activePlan) => {
    try {
        console.log(`Renewing pro-rated pay-as-you-go plan for customer: ${customerId}, plan: ${activePlan.planId}`);

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        console.log(`Customer found: ${customer._id}`);

        const plan = await findPlanById(session, activePlan.planId);
        if (!plan) {
            throw new Error('Plan not found');
        }
        console.log(`Plan found: ${plan._id}`);

        const date = new Date();
        await billGeneration(session, customerId);
        console.log(`Bill generated for customer: ${customerId}`);

        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.isActive': false,
                    'pricingPlans.$.endDate': new Date(),
                }
            },
            { session }
        );
        console.log(`Customer plan deactivated for customer: ${customerId}`);

        const renewalDate = calculateRenewalDate(date, "monthly");
        await createNewPayAsYouGoPlan(session, customerId, plan, renewalDate, false);
        console.log(`New pay-as-you-go plan created for customer: ${customerId}`);
    } catch (error) {
        console.log(`Error renewing pay-as-you-go plan for customer: ${customerId} - ${error.message}`);
        throw new Error('Error in renewing the payAsYouGo plan');
    }
};

const changePlan = async (session, customerId, currentPlan) => {
    try {
        console.log(`Changing plan for customer: ${customerId}, current plan: ${currentPlan.planId}`);

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        console.log(`Customer found: ${customer._id}`);

        const plan = await findPlanById(session, currentPlan.planId);
        const changePlan = await findPlanById(session, customer.changePlanRequest.planId);
        if (!plan || !changePlan) {
            throw new Error('Plan not found');
        }
        console.log(`Current plan and change plan found: ${plan._id}, ${changePlan._id}`);

        if (currentPlan.type == 'Package') {
            const currentDate = new Date();
            const renewalDate = new Date(currentPlan.renewalDate);

            if (renewalDate > currentDate) {
                throw new Error("Renewal date is in the future, plan cannot be renewed yet");
            }
            if (changePlan.type == 'Package') {
                await changePlanFromPackageToPackage(session, customer, plan, changePlan);
            }
            if (changePlan.type == 'PayAsYouGo') {
                await changePlanFromPackageToPayAsYouGo(session, customer, plan, changePlan);
            }
        }
        if (currentPlan.type == 'PayAsYouGo') {
            if (changePlan.type == 'Package') {
                await changePlanFromPayAsYouGoToPackage(session, customer, currentPlan, changePlan);
            }
        }
        console.log(`Plan changed successfully for customer: ${customerId}`);
    } catch (error) {
        console.log(`Error changing plan for customer: ${customerId} - ${error.message}`);
        throw new Error('Something went wrong here');
    }
};

const changePlanFromPackageToPackage = async (session, customer, currentPlan, changePlan) => {
    try {
        console.log(`Changing plan from package to package for customer: ${customer._id}`);

        const customerId = customer._id;
        if (customer.paymentType == 'Postpaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for postpaid customer: ${customerId}`);
        }

        let note = `${getNotes('ChangePlan')} ${changePlan.name}`;
        await handleTransactionPayment(session, customerId, changePlan.price, 'ChangePlan', note);
        console.log(`Transaction payment handled for customer: ${customerId}, change plan: ${changePlan.name}`);

        if (customer.paymentType == 'Prepaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for prepaid customer: ${customerId}`);
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
            { session }
        );
        console.log(`Customer plan deactivated for customer: ${customerId}`);

        const renewalDate = calculateRenewalDate(date, changePlan.quotaValidity);
        await createNewPackagePlan(session, customerId, changePlan, renewalDate, false);
        console.log(`New package plan created for customer: ${customerId}`);

        await Customer.updateOne(
            { _id: customerId, 'changePlanRequest.isActive': true },
            { $set: { 'changePlanRequest.isActive': false } },
            { session }
        );
        console.log(`Change plan request deactivated for customer: ${customerId}`);
    } catch (error) {
        console.log(`Error changing package to package for customer: ${customer._id} - ${error.message}`);
        throw new Error('In change Package');
    }
};

const changePlanFromPackageToPayAsYouGo = async (session, customer, currentPlan, changePlan) => {
    try {
        console.log(`Changing plan from package to pay-as-you-go for customer: ${customer._id}`);

        const customerId = customer._id;
        await billGeneration(session, customerId);
        console.log(`Bill generated for customer: ${customerId}`);

        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.isActive': false,
                    'pricingPlans.$.endDate': new Date(),
                }
            },
            { session }
        );
        console.log(`Customer plan deactivated for customer: ${customerId}`);

        const date = new Date();
        const renewalDate = calculateRenewalDate(date, "monthly");
        await createNewPayAsYouGoPlan(session, customerId, changePlan, renewalDate, false);
        console.log(`New pay-as-you-go plan created for customer: ${customerId}`);

        await Customer.updateOne(
            { _id: customerId, 'changePlanRequest.isActive': true },
            { $set: { 'changePlanRequest.isActive': false } },
            { session }
        );
        console.log(`Change plan request deactivated for customer: ${customerId}`);
    } catch (error) {
        console.log(`Error changing package to pay-as-you-go for customer: ${customer._id} - ${error.message}`);
        throw new Error('Error in changePlanFromPackageToPayAsYouGo');
    }
};

const changePlanFromPayAsYouGoToPackage = async (session, customer, currentPlan, changePlan) => {
    try {
        console.log(`Changing plan from pay-as-you-go to package for customer: ${customer._id}`);

        const customerId = customer._id;
        if (customer.paymentType == 'Postpaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for postpaid customer: ${customerId}`);
        }

        let note = `${getNotes('ChangePlan')} ${changePlan.name}`;
        await handleTransactionPayment(session, customerId, changePlan.price, 'ChangePlan', note);
        console.log(`Transaction payment handled for customer: ${customerId}, change plan: ${changePlan.name}`);

        if (customer.paymentType == 'Prepaid') {
            await billGeneration(session, customerId);
            console.log(`Bill generated for prepaid customer: ${customerId}`);
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
            { session }
        );
        console.log(`Customer plan deactivated for customer: ${customerId}`);

        const renewalDate = calculateRenewalDate(date, changePlan.quotaValidity);
        await createNewPackagePlan(session, customerId, changePlan, renewalDate, false);
        console.log(`New package plan created for customer: ${customerId}`);

        await Customer.updateOne(
            { _id: customerId, 'changePlanRequest.isActive': true },
            { $set: { 'changePlanRequest.isActive': false } },
            { session }
        );
        console.log(`Change plan request deactivated for customer: ${customerId}`);
    } catch (error) {
        console.log(`Error changing pay-as-you-go to package for customer: ${customer._id} - ${error.message}`);
        throw new Error(`Error changing pay-as-you-go to package for customer: ${customer._id} - ${error.message}`);
    }
};


const handleTransactionPayment = async (session, customerId, amount, transactionType, note) => {
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
        throw new Error(`Error processing transaction: ${error.message}`);
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

        await transaction.save({ session });
        console.log(`Transaction created with ID: ${transaction._id}`);
        return transaction;
    } catch (error) {
        console.error("Error while creating the transaction:", error.message);
        throw error;
    }
};

const consumePackage = async (session, customerId, activePlan) => {
    try {
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
            console.log(`Interview Consumed for customerId ${customerId}`);
        } else {
            console.log(`Interviews used exceeds per quota limit for customer ID: ${customerId}, charging additional rate`);
            const price = additionalInterviewRate;
            let note = getNotes('AdditionalInterviewCharge');
            await handleTransactionPayment(session, customerId, price, 'AdditionalInterviewCharge', note);
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                { $inc: { 'pricingPlans.$.details.additionalInterviewsUsed': +1 } },
                { session }
            );
            console.log(`Additional Interview Consumed for customerId ${customerId}`);
        }
    } catch (error) {
        console.error(`Error consuming package: ${error.message}`);
        throw new Error('Something went wrong');
    }
};

const consumePayAsYouGo = async (session, customerId, activePlan) => {
    try {
        const price = activePlan.details.interviewRate;
        console.log(`Consuming PayAsYouGo plan for customer ID: ${customerId} at rate ${price}`);
        let note = getNotes('InterviewCharge');
        await handleTransactionPayment(session, customerId, price, "InterviewCharge", note);
    } catch (error) {
        console.error(`Error consuming PayAsYouGo plan: ${error.message}`);
        throw new Error('Something went wrong');
    }
};

const bonusTopUp = async (session, customerId, amount) => {
    try {
        await billGeneration(session, customerId);

        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            throw new Error('Customer Not Found');
        }

        const bonusAmount = parseInt(amount);

        if (customer.outstandingBalance > 0) {
            if (bonusAmount < customer.outstandingBalance) {
                throw new Error('Bonus amount must be equal to or greater than the outstanding balance');
            }

            if (bonusAmount >= customer.outstandingBalance) {
                customer.outstandingBalance = 0;
                await markInvoicesPaid(session, customerId);
            }
        }

        let beforeUpdateCurrentBalance = customer.currentBalance;
        customer.currentBalance += bonusAmount;
        let afterUpdateCurrentBalance = customer.currentBalance;

        let note = getNotes('Bonus');
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
            { _id: customerId },
            { $inc: { 'currentBalance': bonusAmount } },
            { session }
        );

        console.log(`Bonus top-up completed for customer ID: ${customerId}, new balance: ${afterUpdateCurrentBalance}`);

    } catch (error) {
        console.error(`Error in top-up: ${error.message}`);
        throw new Error(error.message);
    }
};

const getNotes = (transactionType) => {
    return descriptions[transactionType] || "";
};

const changeInterViewRate = async (session, customerId, interviewRate) => {
    try {
        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer Not Found');
        }

        const activePlan = await findCurrentActivePlan(session, customerId);
        if (!activePlan) {
            console.log("No active plan found for the customer, skipping interview rate update.");
            return;
        }
        if (activePlan.type == 'PayAsYouGo') {
            if (activePlan.details.interviewRate == interviewRate) {
                console.log("Same interview rate is already set.");
                return;
            }
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                {
                    $set:
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
            await customer.save({ session });

            console.log(`Interview rate changed to ${interviewRate} for customer ID: ${customerId}`);
        }
    } catch (error) {
        console.error(`Error changing interview rate: ${error.message}`);
        throw new Error(error.message);
    }
};


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
