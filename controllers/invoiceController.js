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
        return sendErrorResponse(resp, 500, error.message)
    }
};

// pay the bill
const payBill = async(req, resp) => {
    try {
        await invoiceService.payBill(req.body);
        return sendSuccessResponse(resp, 200, 'Bill Paid');
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message)
    }
};

module.exports = {
    generateBill,
    customerBills,
    payBill
}