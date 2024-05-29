const Customer = require('../models/Customer');
const Plan = require('../models/Plan');
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

const changePlanRequest = async (req, resp) => {
    const { customer_id } = req.body;
    try {
        const customer = await Customer.findById(customer_id);
        if (customer.changePlanRequest.isActive) {
            // If there is an active change plan request
            const plan = await Plan.findById(customer.changePlanRequest.planId);
            resp.status(200).json({
                message: "Active Change Plan Request",
                data: {
                    changePlanRequest: customer.changePlanRequest,
                    plan: plan
                }
            });
        } else {
            // If there is no active change plan request
            resp.status(200).json({
                message: "No Active Change Plan Request",
                data: {
                    isActive: false
                }
            });
        }
        
    } catch (error) {
        console.log(error);
        resp.status(500).json({
            message: "No Active Change Plan Request",
            data: {
                isActive: false
            }
        });
    }
};

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
    changePlanRequest,
    getPlanDetails
}