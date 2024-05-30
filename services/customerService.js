const { default: mongoose } = require("mongoose");
const Customer = require("../models/Customer");
const { findCurrentActivePlan, billGeneration, changeInterViewRate } = require("../utils/helper");
const Transaction = require("../models/Transaction");
const Invoice = require("../models/Invoice");


// function to create the customer
const createCustomer = async (data) => {
    try {

        const { name, email, phone, region, paymentType } = data;

        if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
            throw new Error ('Invalid email format');
        }

        if (!/^(\([0-9]{3}\) ?|[0-9]{3}-?)[0-9]{3}-?[0-9]{4}$/.test(phone)) {
            throw new Error ('Invalid phone number format');
        }

        const existingCustomer = await Customer.findOne({ $or: [{ email }, { 'contactInformation.phone': phone }] });
        if (existingCustomer) {
            throw new Error ('Invalid phone number formatA customer with the same email or phone already exists');
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

    } catch (error) {

        console.log(error.message)
        throw new error(error.message);
    }
};


// function to get the customers
const getCustomers = async () => {
    try {
        const customers = await Customer.find({})
        return customers;
    } catch (error) {

        console.log(error.message);
        throw new error('Get customers');
    }
};


// Get Customer Details
const customerDetails = async (data)=>{
    try
    {
        const {
            customerId,
        } = data
    
        const customer = await Customer.findById(customerId);
        if(!customer)
        {
            throw new Error('Customer not found')
        }
        return customer;
    }
    catch(error)
    {
        console.log(`Error while getting the customer`)
        throw new Error(`Error while fetching the customer`)
    }

}


const userPlans = async (data) =>{
    const { customerId } = data;
    try {
        const customer = await Customer.findById(customerId);
        return customer.pricingPlans

    } catch (error) {
        throw new Error('Error in fetching the plans');
    }
}

const resetAccount = async (data) => {
    let session
    const { customerId } = data;
    try {

        console.log(customerId);
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

        await Transaction.deleteMany({customerId}).session(session);

        await Invoice.deleteMany({customerId}).session(session);

        await session.commitTransaction();
        session.endSession();

    } catch (error) {
        if(session)
        {
            await session.commitTransaction();
            session.endSession();
        }
        throw new Error(error.message);
    }
};

const deactivateAccount = async (data)=>{
    let session;
    try
    {
        const {customerId} = data;

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
            {session}
        );

        await session.commitTransaction();
        session.endSession();
    }
    catch(error)
    {
        console.log(error.message)
        if(session)
        {  
            await session.abortTransaction();
            session.endSession();
        }
        
        throw new Error(err.message)
    }
}

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