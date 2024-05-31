require('dotenv').config();
const { handler } = require('./renewPlanLambda');

const runTest = async () => {
    try {
        await handler({});
        console.log('Lambda function executed successfully');
    } catch (error) {
        console.error('Error executing Lambda function:', error);
    }
};

runTest();