const { default: mongoose } = require("mongoose");
const Invoice = require("../models/Invoice");
const { billGeneration, findCustomerById, getNotes } = require("../utils/helper");

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
    try
    {
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

    }
    catch(error)
    {

    }
    const { invoiceId, customerId } = req.body;


    if(invoice.status=='paid')
    {
        return resp.status(404).json({
            'message': 'Already Paid the Bill'
        });
    }

    const date = new Date();
    const payment = new Payment({
        customerId,
        invoiceId,
        date,
        amount: invoice.totalAmount,
        status: "completed",
    })
    await payment.save()

    let { currentBalance } = customer;

    const beforeUpdateCurrentBalance = currentBalance
    customer.outstandingBalance-=invoice.totalAmount
    customer.currentBalance+=invoice.totalAmount
    const afterUpdateCurrentBalance = customer.currentBalance
    note = getNotes('BillPaid')
    const transaction = new Transaction({
        customerId: customerId,
        type: 'BillPaid',
        date: date,
        status: 'billed',
        billingCycle: date,
        details: {
            name: 'Bill Paid',
            amount: invoice.totalAmount,
            note: note 
        },
        transactionType: 'credit',
        beforeUpdateCurrentBalance,
        afterUpdateCurrentBalance
    })

    await customer.save();
    invoice.status='paid'
    await invoice.save();
    await transaction.save();

    return resp.status(200).json({
        'message': 'Bill Paid'
    });
};



module.exports = {
    generateBill,
    customerBills
}
