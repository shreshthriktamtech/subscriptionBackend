const consumeInterviewService = require('../services/consumeInterviewService');
const { sendErrorResponse, sendSuccessResponse } = require("../utils/response");


const consumeInterview = async (req, resp) => {
    try {
        await consumeInterviewService.consumeInterview(req.body)
        return sendSuccessResponse(resp, 200, 'Interview Consumed');
    } catch (error) {
        return sendErrorResponse(resp, 500, error.message);
    }
};



// if(currentBalance<amount)
//     {
//         if(currentPlanType=='PayAsYouGo' && paymentType=='Prepaid' && customer.canOveruseInterviews == false)
//         {
//             return {'message':"Insufficent Balance", 'status': false};
//         }
//     }

module.exports = {
    consumeInterview
}