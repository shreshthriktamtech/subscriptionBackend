const { default: mongoose } = require("mongoose");
const Customer = require("../models/Customer");
const Transaction = require("../models/Transaction");
const { billGeneration, markInvoicesPaid, createTransaction, createInvoice, getNotes } = require("../utils/helper");

// fetch the customer transactions
const fetchCustomerTransations = async (data)=>{
    try
    {
        const {
            customerId,
        } = data;
    
        const transactions = await Transaction.find({customerId}).sort('-createdAt');
        return transactions;
    }
    catch(error)
    {
        console.error(`Error fetching the transactions for customerId ${customerId}: ${error.message}`);
        throw new Error(error.message)
    }

}

// TopUp
const topUp = async (data)=> {
    let session
    try
    {
        const {customerId, amount} = data

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
                throw new Error('Top-up amount must be equal to or greater than the outstanding balance')
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

        const invoiceData= {
            customerId: customerId,
            'totalAmount': topUpAmount,
            'totalPrice': topUpAmount,
            totalTax: 0,
            status: 'paid',
            lineItems
        };

        await createInvoice(session, invoiceData);
        await Customer.updateOne(
            { _id: customerId},
            { $set: 
                { 'currentBalance': customer.currentBalance,
                  'outstandingBalance': customer.outstandingBalance
                } },
            { session }
        );
        await session.commitTransaction();
        session.endSession();
    }
    catch(error)
    {
        console.log(`Error in topup ${error.message}`);
        if(session)
        {
            await session.abortTransaction();
            session.endSession();
        }

        throw new Error(error.message)
    }
}




module.exports = {
    fetchCustomerTransations,
    topUp
}