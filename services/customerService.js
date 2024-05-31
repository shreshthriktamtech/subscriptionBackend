const { default: mongoose } = require("mongoose");
const Customer = require("../models/Customer");
const { findCurrentActivePlan, billGeneration, changeInterViewRate } = require("../utils/helper");
const Transaction = require("../models/Transaction");
const Invoice = require("../models/Invoice");

// Function to create the customer
const createCustomer = async (data) => {
    try {
        const { name, email, phone, region, paymentType } = data;
        console.log(`Creating customer with data: ${JSON.stringify(data)}`);

        if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
            throw new Error('Invalid email format');
        }

        if (!/^(\([0-9]{3}\) ?|[0-9]{3}-?)[0-9]{3}-?[0-9]{4}$/.test(phone)) {
            throw new Error('Invalid phone number format');
        }

        const existingCustomer = await Customer.findOne({ $or: [{ email }, { 'contactInformation.phone': phone }] });
        if (existingCustomer) {
            throw new Error('A customer with the same email or phone already exists');
        }

        const customer = new Customer({
            name,
            email,
            contactInformation: {
                phone,
            },
            region,
            paymentType
        });

        await customer.save();
        console.log(`Customer created successfully: ${customer._id}`);
    } catch (error) {
        console.error(`Error creating customer: ${error.message}`);
        throw new Error(error.message);
    }
};

// Function to get the customers
const getCustomers = async () => {
    try {
        console.log('Fetching all customers');
        const customers = await Customer.find({});
        console.log(`Fetched ${customers.length} customers`);
        return customers;
    } catch (error) {
        console.error(`Error fetching customers: ${error.message}`);
        throw new Error('Get customers');
    }
};

// Get Customer Details
const customerDetails = async (data) => {
    try {
        const { customerId } = data;
        console.log(`Fetching details for customer ID: ${customerId}`);

        const customer = await Customer.findById(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        console.log(`Customer details fetched for ID: ${customerId}`);
        return customer;
    } catch (error) {
        console.error(`Error fetching customer details for ID ${customerId}: ${error.message}`);
        throw new Error('Error while fetching the customer');
    }
};

// Function to get user plans
const userPlans = async (data) => {
    const { customerId } = data;
    try {
        console.log(`Fetching plans for customer ID: ${customerId}`);
        const customer = await Customer.findById(customerId);
        console.log(`Plans fetched for customer ID: ${customerId}`);
        return customer.pricingPlans;
    } catch (error) {
        console.error(`Error fetching plans for customer ID ${customerId}: ${error.message}`);
        throw new Error('Error in fetching the plans');
    }
};

// Function to reset account
const resetAccount = async (data) => {
    let session;
    const { customerId } = data;
    try {
        console.log(`Resetting account for customer ID: ${customerId}`);
        session = await mongoose.startSession();
        session.startTransaction();

        const customer = await Customer.findById(customerId).session(session);
        if (!customer) {
            throw new Error("Customer not found");
        }

        customer.currentBalance = 0;
        customer.outstandingBalance = 0;
        customer.pricingPlans = [];
        customer.changePlanRequest = {
            isActive: false,
            planId: null,
            requestedDate: null,
        };

        await customer.save({ session });

        await Transaction.deleteMany({ customerId }).session(session);
        await Invoice.deleteMany({ customerId }).session(session);

        await session.commitTransaction();
        console.log(`Account reset successfully for customer ID: ${customerId}`);
    } catch (error) {
        if (session) {
            await session.abortTransaction();
            console.error(`Transaction aborted for customer ID ${customerId}: ${error.message}`);
        }
        throw new Error(error.message);
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

// Function to deactivate account
const deactivateAccount = async (data) => {
    let session;
    try {
        const { customerId } = data;
        console.log(`Deactivating account for customer ID: ${customerId}`);

        session = await mongoose.startSession();
        session.startTransaction();

        await billGeneration(session, customerId);

        await Customer.updateOne(
            { _id: customerId, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.isActive': false,
                    'pricingPlans.$.endDate': new Date(),
                    'isActive': false
                }
            },
            { session }
        );

        await session.commitTransaction();
        console.log(`Account deactivated successfully for customer ID: ${customerId}`);
    } catch (error) {
        console.error(`Error deactivating account for customer ID ${customerId}: ${error.message}`);
        if (session) {
            await session.abortTransaction();
        }
        throw new Error(error.message);
    } finally {
        if (session) {
            session.endSession();
        }
    }
};


const updateCustomer = async (data) => {
    let session;
    try {

        session = await mongoose.startSession();
        session.startTransaction();

        const {
            customerId, 
            email, 
            name, 
            phone, 
            currency, 
            tax, 
            paymentType, 
            canOveruseInterviews, 
            interviewRate 
        } = data;

        // Validate email format
        if (email && !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
            throw new Error('Invalid email format');
        }

        // Validate phone format
        if (phone && !/^(\([0-9]{3}\) ?|[0-9]{3}-?)[0-9]{3}-?[0-9]{4}$/.test(phone)) {
            throw new Error ("Invalid phone number format");
        }

        // Create an update object
        const updateFields = {};
        if (email) updateFields.email = email;
        if (name) updateFields.name = name;
        if (currency) updateFields.currency = currency;
        if (tax) updateFields.tax = tax;
        if (paymentType) updateFields.paymentType = paymentType;
        if (interviewRate) updateFields.interviewRate = interviewRate;
        if (canOveruseInterviews!==undefined) updateFields.canOveruseInterviews  = canOveruseInterviews;
        
        if (phone) {
            updateFields['contactInformation.phone'] = phone;
        }

        const customer = await Customer.findByIdAndUpdate(customerId, updateFields, { new: true, session });

        if (!customer) {
            throw new Error ("Customer Not Found");
        }
        await changeInterViewRate(session, customerId, interviewRate)
        
        await session.commitTransaction();
        session.endSession();
        
    } catch (error) {
        if(session)
        {
            await session.abortTransaction();
            session.endSession();
        }
        console.error(error);
        throw new Error(error.message)
    }
};



module.exports = {
    customerDetails,
    createCustomer,
    getCustomers,
    userPlans,
    resetAccount,
    deactivateAccount,
    updateCustomer
}