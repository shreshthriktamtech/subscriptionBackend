const planService = require('../services/planService');
const { sendSuccessResponse, sendErrorResponse } = require('../utils/response');

// create a plan
const createPlan = async (req, resp) => {
    try {
        await planService.createPlan(req.body)
        return sendSuccessResponse(resp, 201, 'Plan created successfully')

    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};

// get plans
const getPlans = async (req, resp) => {
    try {
        const plans = await planService.getPlans()
        return sendSuccessResponse(resp, 200, 'List of plans', plans);
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};

// function to get current active plan
const currentActivePlan = async (req, resp) => {
    try {
        const curentPlan = await planService.currentActivePlan(req.body);
        return sendSuccessResponse(resp, 200, 'Current active plan', curentPlan);
      
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};

// function to assign the plan to customer
const assignPlan = async(req, resp) => {
    try
    {
        await planService.assignPlanToCustomer(req.body)
        return sendSuccessResponse(resp, 200 , "Plan Assigned Successfully");
    }
    catch(error)
    {
        console.log(`Error occured while assiging the plan ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
};

// request for plan change
const planChangeRequest = async (req, resp) => {
    try
    {
        await planService.planChangeRequest(req.body)
        return sendSuccessResponse(resp, 200 , "Plan changed request raised Successfully");
    }
    catch(error)
    {
        console.log(`Error occured while assiging the plan ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
};

// renew active plan
const renewActivePlan = async (req, resp) => {
    try
    {
        await planService.renewPlan(req.body)
        return sendSuccessResponse(resp, 200 , "Plan activated Successfully");
    }
    catch(error)
    {
        console.log(`Error occured while assiging the plan ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
};

// get the current plan details
const getPlanDetails = async (req, resp) => {
    try {
        const details = await planService.getPlanDetails(req.body)
        return sendSuccessResponse(resp, 200, 'List of plans', details);
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};

module.exports = {
    createPlan,
    getPlans,
    currentActivePlan,
    assignPlan,
    renewActivePlan,
    planChangeRequest,
    getPlanDetails
}