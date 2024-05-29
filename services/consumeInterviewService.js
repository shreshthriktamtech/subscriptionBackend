const { default: mongoose } = require("mongoose");
const { findCustomerById, consumePackage, consumePayAsYouGo, findCurrentActivePlan } = require("../utils/helper");

const consumeInterview = async (data) => {
    let session;
    try
    {
        const {customerId} = data;
        session = await mongoose.startSession();
        session.startTransaction();

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer Not found');
        }
    
        const activePlan = await findCurrentActivePlan(session, customerId);
        if (!activePlan) {
            throw new Error('No active Plan is there');
        }

        console.log(`Active plan type for customer ID: ${customerId} is ${activePlan.type}`);
        
        const currentPlanType = activePlan.type
        if (currentPlanType === 'Package') {
            await consumePackage(session, customerId, activePlan);
    
        } else if (currentPlanType === 'PayAsYouGo') {
            await consumePayAsYouGo(session, customerId, activePlan); 
        }

        await session.commitTransaction();
        session.endSession();
    }
    catch(error)
    {
        if(session)
        {
            await session.abortTransaction();
            session.endSession();
        }
        console.log(error.message);
        throw new Error(error.message);
    }
};

module.exports = {
    consumeInterview
}