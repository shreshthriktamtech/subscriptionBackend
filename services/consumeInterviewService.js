const { default: mongoose } = require("mongoose");
const { findCustomerById, consumePackage, consumePayAsYouGo, findCurrentActivePlan } = require("../utils/helper");

const consumeInterview = async (data) => {
    let session;
    try {
        const { customerId } = data;
        console.log(`Starting transaction for customer ID: ${customerId}`);
        
        session = await mongoose.startSession();
        session.startTransaction();

        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            console.log(`Customer Not found for ID: ${customerId}`);
            throw new Error('Customer Not found');
        }
        console.log(`Customer found for ID: ${customerId}`);

        const activePlan = await findCurrentActivePlan(session, customerId);
        if (!activePlan) {
            console.log(`No active Plan found for customer ID: ${customerId}`);
            throw new Error('No active Plan is there');
        }
        console.log(`Active plan found for customer ID: ${customerId}. Plan type: ${activePlan.type}`);

        const currentPlanType = activePlan.type;
        if (currentPlanType === 'Package') {
            console.log(`Consuming Package plan for customer ID: ${customerId}`);
            await consumePackage(session, customerId, activePlan);
        } else if (currentPlanType === 'PayAsYouGo') {
            console.log(`Consuming PayAsYouGo plan for customer ID: ${customerId}`);
            await consumePayAsYouGo(session, customerId, activePlan);
        }

        await session.commitTransaction();
        console.log(`Transaction committed for customer ID: ${customerId}`);
    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
            console.log(`Transaction aborted for customer ID: ${customerId}`);
        }
        console.log(`Error for customer ID: ${customerId}: ${error.message}`);
        throw new Error(error.message);
    } finally {
        if (session) {
            session.endSession();
            console.log(`Session ended for customer ID: ${customerId}`);
        }
    }
};

module.exports = {
    consumeInterview
};
