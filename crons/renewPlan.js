const cron = require('node-cron');
const Customer = require('../models/Customer');
const { renewPlan } = require('../services/planService');

const renewPlanCron = async () => {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const query = {
        pricingPlans: {
            $elemMatch: {
                isActive: true,
                renewalDate: {
                    $gte: todayStart,
                    $lt: todayEnd
                }
            }
        }
    };

    const customer = await Customer.findOne(query);
    if(customer)
    {
        console.log(`Renew the plan for ${customer._id}`)
        const customerId = customer._id
        await renewPlan({customerId})
    }
    else
    {
        console.log(`No renewal is there`);
    }

}

const renewPlanCronJob = cron.schedule('*/5 * * * * *', async () => {
    try {
        await renewPlanCron();
    } catch (error) {
        console.error('Error in cron job:', error);
    }
});

module.exports = {
    renewPlanCronJob
}