const { default: mongoose } = require("mongoose");
const Customer = require("../models/Customer");
const Transaction = require("../models/Transaction");
const { billGeneration, markInvoicesPaid, createTransaction, createInvoice, getNotes, findPlanById, calculateProration, findCustomerById, findCurrentActivePlan, handleTransactionPayment } = require("../utils/helper");

// fetch the customer transactions
const fetchCustomerTransations = async (data) => {
    try {
        const {
            customerId,
        } = data;

        const transactions = await Transaction.find({ customerId }).sort('-createdAt');
        return transactions;
    }
    catch (error) {
        console.error(`Error fetching the transactions for customerId ${customerId}: ${error.message}`);
        throw new Error(error.message)
    }
}

// TopUp
const topUp = async (data) => {
    let session
    try {
        const { customerId, amount } = data

        session = await mongoose.startSession();
        session.startTransaction();

        await billGeneration(session, customerId);

        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            throw new Error('Customer Not Found');
        }

        const topUpAmount = parseInt(amount);
        let remainingAmount = topUpAmount;

        if (customer.outstandingBalance > 0) {
            if (topUpAmount < customer.outstandingBalance) {
                throw new Error(`Minimum Bonus of ${customer.outstandingBalance} is required`);
            }

            if (topUpAmount >= customer.outstandingBalance) {
                remainingAmount = topUpAmount - customer.outstandingBalance;
                customer.outstandingBalance = 0;
                await markInvoicesPaid(session, customerId)

            }
        }

        let beforeUpdateCurrentBalance = customer.currentBalance;
        customer.currentBalance += topUpAmount;
        let afterUpdateCurrentBalance = customer.currentBalance;

        let note = getNotes('TopUp')
        await createTransaction(
            session,
            customerId,
            'TopUp',
            'billed',
            {
                name: 'Top up',
                price: topUpAmount,
                amount: topUpAmount,
                calculatedTax: 0,
                tax: 0,
                note: note
            },
            beforeUpdateCurrentBalance,
            afterUpdateCurrentBalance,
            'credit'
        );

        const lineItems = [{
            description: 'Top Up',
            amount: amount,
        }];

        const invoiceData = {
            customerId: customerId,
            'totalAmount': topUpAmount,
            'totalPrice': topUpAmount,
            totalTax: 0,
            status: 'paid',
            lineItems
        };

        await createInvoice(session, invoiceData);
        await Customer.updateOne(
            { _id: customerId },
            {
                $set:
                {
                    'currentBalance': customer.currentBalance,
                    'outstandingBalance': customer.outstandingBalance
                }
            },
            { session }
        );
        await session.commitTransaction();
        session.endSession();
        console.log(`Top Up successful for customerId ${customerId} with amount ${topUpAmount}`);
    }
    catch (error) {
        console.log(`Error in topup ${error.message}`);
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }

        throw new Error(error.message)
    }
}

// Update Billing Cycle
const updateBillingCycle = async (data) => {
    let session;
    try {
        const { billingDate, updateBillingDate, customerId } = data;
        session = await mongoose.startSession();
        session.startTransaction();


        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer Not Found');
        }

        const activePlan = await findCurrentActivePlan(session, customerId);
        if (!activePlan) {
            throw new Error('No Active Plan for the customer')
        }

        if (activePlan.type == 'PayAsYouGo') {
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                {
                    $set: {
                        'pricingPlans.$.renewalDate': updateBillingDate,
                    }
                },
                { session }
            )
        }
        else if (activePlan.type == 'Package') {

            const plan = await findPlanById(session, activePlan.planId);

            const { proRatedPrice, proRatedInterviews } = calculateProration(new Date(billingDate), new Date(updateBillingDate), plan)

            let note = `Billing Cycle changed from ${new Date(billingDate).toDateString()} to  ${new Date(updateBillingDate).toDateString()}`
            
            await handleTransactionPayment(session, customerId, parseInt(proRatedPrice), 'ChangeBillingCycle', note)
            
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                {
                    $set: {
                        'pricingPlans.$.renewalDate': updateBillingDate,
                    },
                    $inc: {
                        'pricingPlans.$.details.interviewsPerQuota': proRatedInterviews,
                    },
                },
                { session }
            )

            await session.commitTransaction();
            session.endSession();
        }
    }
    catch (error) {
        if(session)
        {
            await session.abortTransaction();
            session.endSession();
        }
        console.log(error.message);
        throw new Error(error.message)
    }
}


// Promo topUp
const promoTopUp = async (data) => {
    let session
    try {
        const { customerId, amount } = data

        session = await mongoose.startSession();
        session.startTransaction();

        await billGeneration(session, customerId);

        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            throw new Error('Customer Not Found');
        }

        const topUpAmount = parseInt(amount);
        let remainingAmount = topUpAmount;

        if (customer.outstandingBalance > 0) {
            if (topUpAmount < customer.outstandingBalance) {
                throw new Error(`Minimum Bonus of ${customer.outstandingBalance} is required`);
            }

            if (topUpAmount >= customer.outstandingBalance) {
                remainingAmount = topUpAmount - customer.outstandingBalance;
                customer.outstandingBalance = 0;
                await markInvoicesPaid(session, customerId)
            }
        }

        let beforeUpdateCurrentBalance = customer.currentBalance;
        customer.currentBalance += topUpAmount;
        let afterUpdateCurrentBalance = customer.currentBalance;

        let note = getNotes('Bonus')
        await createTransaction(
            session,
            customerId,
            'Bonus',
            'billed',
            {
                name: 'Promo Credit',
                price: topUpAmount,
                amount: topUpAmount,
                calculatedTax: 0,
                tax: 0,
                note: note
            },
            beforeUpdateCurrentBalance,
            afterUpdateCurrentBalance,
            'credit'
        );

        await Customer.updateOne(
            { _id: customerId },
            {
                $set:
                {
                    'currentBalance': customer.currentBalance,
                    'outstandingBalance': customer.outstandingBalance
                }
            },
            { session }
        );

        await session.commitTransaction();
        session.endSession();
    }
    catch (error) {

        console.log(`Error in topup ${error.message}`);
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }

        throw new Error(error.message)
    }
}



module.exports = {
    fetchCustomerTransations,
    topUp,
    updateBillingCycle,
    promoTopUp
}