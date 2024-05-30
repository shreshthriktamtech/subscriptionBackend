const transactionService = require('../services/transactionService')
const { sendErrorResponse, sendSuccessResponse } = require('../utils/response')

// function to get the customer transations
const customerTransactions = async (req, resp)=>{
    try
    {
        const data = await transactionService.fetchCustomerTransations(req.body)
        return sendSuccessResponse(resp, 200, 'Customer Transactions Details', data)
    }
    catch(error)
    {
        console.log(`Error occured while fetching the customer transactions ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
    
}

// function topUpp
const topUp = async (req, resp)=>{
    try
    {
        await transactionService.topUp(req.body)
        return sendSuccessResponse(resp, 200, 'Transaction Completed')
    }
    catch(error)
    {
        console.log(`Error occured while fetching the customer transactions ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
}

// update billing cycle
const updateBillingCycle = async (req, resp) =>{
    try
    {
        await transactionService.updateBillingCycle(req.body)
        return sendSuccessResponse(resp, 200, 'Transaction Completed')
    }
    catch(error)
    {
        console.log(`Error occured while fetching the customer transactions ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
}


module.exports = {
    customerTransactions,
    topUp,
    updateBillingCycle
}
