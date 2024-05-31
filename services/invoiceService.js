const { default: mongoose } = require("mongoose");
const Invoice = require("../models/Invoice");
const { billGeneration, findCustomerById, getNotes, createTransaction } = require("../utils/helper");
const Customer = require("../models/Customer");
const Payment = require("../models/Payment");

// Generate Bill
const generateBill = async (data) => {
    let session;
    try {
        const { customerId } = data;
        console.log(`Generating bill for customer: ${customerId}`);

        session = await mongoose.startSession();
        session.startTransaction();

        await billGeneration(session, customerId);
        console.log('Bill generation successful');

        await session.commitTransaction();
        console.log('Transaction committed successfully');
        session.endSession();
    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }
        console.log(`Error generating bills: ${error.message}`);
        throw new Error('Error while generating the bill');
    }
}

// Get customer Bills
const customerBills = async (data) => {
    let session;
    try {
        const { customerId } = data;
        console.log(`Fetching bills for customer: ${customerId}`);

        session = await mongoose.startSession();
        session.startTransaction();

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer Not found');
        }
        console.log(`Customer found: ${customer._id}`);

        const invoices = await Invoice.find({ customerId: customerId })
            .sort('-createdAt')
            .session(session);

        if (invoices.length == 0) {
            throw new Error('No invoices are there');
        }
        console.log(`Invoices found: ${invoices.length}`);

        await session.commitTransaction();
        session.endSession();

        return invoices;
    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }
        console.log(`Error fetching customer bills: ${error.message}`);
        throw new Error('Something went wrong');
    }
};

// Pay Bill
const payBill = async (data) => {
    let session;
    try {
        const { invoiceId, customerId } = data;
        console.log(`Paying bill for invoice: ${invoiceId}, customer: ${customerId}`);

        session = await mongoose.startSession();
        session.startTransaction();

        const invoice = await Invoice.findById(invoiceId).session(session);
        if (!invoice) {
            throw new Error('Invoice not found');
        }
        console.log(`Invoice found: ${invoice._id}, status: ${invoice.status}`);

        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            throw new Error('Customer not found');
        }
        console.log(`Customer found: ${customer._id}`);

        if (invoice.status == 'paid') {
            throw new Error('Already paid the bill');
        }

        const date = new Date();

        const payment = new Payment({
            customerId,
            invoiceId,
            date,
            amount: invoice.totalAmount,
            status: "completed",
        });
        await payment.save({ session });
        console.log('Payment record saved');

        let { currentBalance } = customer;

        const beforeUpdateCurrentBalance = currentBalance;

        customer.outstandingBalance -= invoice.totalAmount;
        customer.currentBalance += invoice.totalAmount;

        const afterUpdateCurrentBalance = customer.currentBalance;

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
                note: note,
            },
            beforeUpdateCurrentBalance,
            afterUpdateCurrentBalance,
            'credit'
        );
        console.log('Transaction created');

        await customer.save({ session });
        invoice.status = 'paid';
        await invoice.save({ session });

        await session.commitTransaction();
        session.endSession();
        console.log('Transaction committed successfully');
    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }
        console.log(`Error paying bill: ${error.message}`);
        throw new Error(error.message);
    }
};


module.exports = {
    generateBill,
    customerBills,
    payBill
}
