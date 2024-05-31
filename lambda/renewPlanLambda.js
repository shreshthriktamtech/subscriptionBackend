const mongoose = require('mongoose');
const { renewPlan } = require('../services/planService');
const Customer = require('../models/Customer');

exports.handler = async (event) => {
    try {
        console.log('Lambda function starts')
        console.log(process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Mongo Db connected")

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        
        console.log(`Running for renewalDate between ${startOfToday} to ${endOfToday}`);

        const customers = await Customer.find({
        'pricingPlans.isActive': true,
        'pricingPlans.renewalDate': {
            $gte: startOfToday,
            $lt: endOfToday
        }
        });

        
        console.log(`Running for ${customers.length} customers`);
        for (const customer of customers) {
            try {
                console.log(`Running Lambda for customer ${customer.name} and id ${customer._id}`);
                await renewPlan({ customerId: customer._id });
            } catch (error) {
                console.error(`Error renewing plan for customer ${customer._id}: ${error.message}`);
            }
        }
        await mongoose.connection.close();

        const response = {
            statusCode: 200,
            body: JSON.stringify(`Renewal Done for ${startOfToday.toDateString()}`),
          };
        return response;
    } catch (error) {
        const startOfToday = new Date();
        console.error(`Error in Lambda function: ${error.message}`);
        const response = {
            statusCode: 500,
            body: JSON.stringify(`Opps! something went wrong in renewal for ${startOfToday.toDateString()}`),
          };
        return response;


    }
};
