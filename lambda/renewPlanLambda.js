const mongoose = require('mongoose');
const { renewPlan } = require('../services/planService');
const Customer = require('../models/Customer');

exports.handler = async (event) => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const customers = await Customer.find({ 'pricingPlans.isActive': true });
        for (const customer of customers) {
            try {
                console.log(`Running Lambda for customer ${customer.name} and id ${customer._id}`);
                await renewPlan({ customerId: customer._id });
            } catch (error) {
                console.error(`Error renewing plan for customer ${customer._id}: ${error.message}`);
            }
        }
        await mongoose.connection.close();
    } catch (error) {
        console.error(`Error in Lambda function: ${error.message}`);
        throw new Error(`Error in Lambda function: ${error.message}`);
    }
};
