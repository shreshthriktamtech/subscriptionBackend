const customerService = require('../services/customerService');
const { sendErrorResponse, sendSuccessResponse } = require('../utils/response');

// create a customer
const createCustomer = async (req, resp) => {
    try {
        await customerService.createCustomer(req.body)
        return sendSuccessResponse(resp, 201, 'Customer Created');
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};

// function to get the customers
const getCustomers = async (req, resp) => {
    try {
       const customers = await customerService.getCustomers();
       return sendSuccessResponse(resp, 200, 'Customers', customers);
        
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};

// get customer
const getCustomer = async (req, resp)=>{
    try{
        const customer = await customerService.customerDetails(req.body)
        return sendSuccessResponse(resp, 200, 'Customer', customer);
      
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
}

// reset the customer account
const resetAccount = async (req, resp) => {
    try{
        await customerService.resetAccount(req.body)
        return sendSuccessResponse(resp, 200, 'Customer Account is reset');
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};

// get the user plans
const userPlans = async (req, resp) =>{
    try {
        const plans = await customerService.userPlans(req.body)
        return sendSuccessResponse(resp, 200, 'User plans', plans);
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
}

// deactivate the user account
const deactivateAccount = async (req, resp) =>{
    try {
        await customerService.deactivateAccount(req.body)
        return sendSuccessResponse(resp, 200, 'Deactivate Account');
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
}

module.exports = {
    createCustomer,
    getCustomers,
    getCustomer,
    resetAccount,
    userPlans,
    deactivateAccount
}