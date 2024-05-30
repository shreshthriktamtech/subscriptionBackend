const { default: mongoose } = require("mongoose");
const Invoice = require("../models/Invoice");
const { billGeneration, findCustomerById, getNotes, createTransaction } = require("../utils/helper");
const Customer = require("../models/Customer");
const Payment = require("../models/Payment");

// Generate Bill
const generateBill = async (data) => {
    try
    {
        const { customerId } = data;

        const session = await mongoose.startSession();
        session.startTransaction();

        await billGeneration(session, customerId);

        await session.commitTransaction();
        session.endSession();
    }
    catch(error)
    {
        await session.abortTransaction();
        session.endSession();
        console.log(`Error generating bills ${error.message}`)
        throw new Error('Error whike generating the bill')
    }
}

// get customer Bills
const customerBills = async (data) => {
    let session
    try
    {
        const { customerId } = data;

        session = await mongoose.startSession();
        session.startTransaction();

        const customer = await findCustomerById(session, customerId);
        if (!customer){
            throw new Error('Customer Not found')
        };

        const invoices = await Invoice.find({
            customerId: customerId
        }).sort('-createdAt').session(session);

        if(invoices.length == 0)
        {
            throw new Error('No invoices are there')
        }
        await session.commitTransaction();
        session.endSession();

        return invoices;
    }
    catch(error)
    {
        if(session)
        {
            await session.abortTransaction();
            session.endSession();
        }
        console.log(error);
        throw new Error('Something went wrong');
    }
};

const payBill = async(data) => {
    let session;
    try
    {
        const {invoiceId, customerId} = data;

        const session = await mongoose.startSession();
        session.startTransaction();

        const invoice = await Invoice.findById(invoiceId).session(session);
        if (!invoice) {
            throw new Error('Invoice not found')
        }

        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            throw new Error('Customer not found')
        }
        
        if(invoice.status=='paid')
        {
            throw new Error('Already paid the bill')
        }

        const date = new Date();

        const payment = new Payment({
            customerId,
            invoiceId,
            date,
            amount: invoice.totalAmount,
            status: "completed",
        })
        await payment.save({ session })
    
        let { currentBalance } = customer;
    
        const beforeUpdateCurrentBalance = currentBalance

        customer.outstandingBalance-=invoice.totalAmount
        customer.currentBalance+=invoice.totalAmount

        const afterUpdateCurrentBalance = customer.currentBalance
    
        const note = getNotes('BillPaid');
        await createTransaction(
            session,
            customerId,
            'BillPaid',
            'billed',
            {
                name: 'Bill Paid',
                price: invoice.totalAmount,
                amount: invoice.totalAmount,
                calculatedTax: 0,
                tax: 0,
                note: note
            },
            beforeUpdateCurrentBalance,
            afterUpdateCurrentBalance,
            'credit'
        )
    
    
        await customer.save({session});
        invoice.status='paid'
        await invoice.save({session});
        
        await session.commitTransaction();
        session.endSession();
    }
    catch(error)
    {
        if(session)
        {
            await session.abortTransaction();
           session.endSession
        }
        console.log(error.message);
        throw new Error(error.message);
    }
};



module.exports = {
    generateBill,
    customerBills,
    payBill
}
