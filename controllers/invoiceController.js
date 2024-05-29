const invoiceService = require('../services/invoiceService');
const { sendSuccessResponse, sendErrorResponse } = require('../utils/response');

// Generate Bills
const generateBill = async (req, resp) => {
    try
    {
        await invoiceService.generateBill(req.body)
        return sendSuccessResponse(resp, 200, 'Bill generated')
    }
    catch(error)
    {
        return sendErrorResponse(resp, 500, error.message)
    }
};

// Fetch Customer Bills
const customerBills = async (req, resp) => {
    try {
        const invoices = await invoiceService.customerBills(req.body);
        return sendSuccessResponse(resp, 200, 'Invoices', invoices);
    } catch (error) {
        console.log('dada')
        return sendErrorResponse(resp, 500, error.message)
    }
};

// pay the bill
const payBill = async(req, resp) => {
    const { invoiceId, customerId } = req.body;

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
        return resp.status(404).json({
            'message': 'Invoice not found'
        });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
        return resp.status(404).json({
            message: 'Customer not found'
        });
    }


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

    const transaction = new Transaction({
        customerId: customerId,
        type: 'BillPaid',
        date: date,
        status: 'billed',
        billingCycle: date,
        details: {
            name: 'Bill Paid',
            amount: invoice.totalAmount,
            note: "Bill Paid" 
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
    customerBills,
    payBill
}