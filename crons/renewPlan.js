const cron = require('node-cron');

const renewPlan = async () => {
    console.log('Plan Cron is running')
}

const renewPlanCron = cron.schedule('*/5 * * * * *', async () => {
    try {
        await renewPlan();
    } catch (error) {
        console.error('Error in cron job:', error);
    }
});

module.exports = {
    renewPlanCron
}