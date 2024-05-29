const Customer = require('../models/Customer')
const transactionService = require('../services/transactionService')
const { sendErrorResponse, sendSuccessResponse } = require('../utils/response')

// function to get the customer transations
const customerTransactions = async (req, resp)=>{
    try
    {
        const data = await transactionService.fetchCustomerTransations(req.body)
        return sendSuccessResponse(resp, 200, 'Customer Transactions Details', data)
    }
    catch(error)
    {
        console.log(`Error occured while fetching the customer transactions ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
    
}

// function topUpp
const topUp = async (req, resp)=>{
    try
    {
        await transactionService.topUp(req.body)
        return sendSuccessResponse(resp, 200, 'Transaction Completed')
    }
    catch(error)
    {
        console.log(`Error occured while fetching the customer transactions ${error.message}`)
        return sendErrorResponse(resp, 500 , error.message);
    }
}

const updateCustomer = async (req, resp) => {
    try {
        const customerId = req.params.id;
        const { email, name, phone, currency, tax, paymentType, canOveruseInterviews, interviewRate } = req.body;
        console.log(req.body)

        // Validate email format
        if (email && !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
            return resp.status(400).json({ message: "Invalid email format" });
        }

        // Validate phone format
        if (phone && !/^(\([0-9]{3}\) ?|[0-9]{3}-?)[0-9]{3}-?[0-9]{4}$/.test(phone)) {
            return resp.status(400).json({ message: "Invalid phone number format" });
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

        const customer = await Customer.findByIdAndUpdate(customerId, updateFields, { new: true });

        if (!customer) {
            return resp.status(404).json({ message: "Customer not found" });
        }
        await changeInterViewRate(customerId, interviewRate)
        resp.status(200).json({ message: "Customer updated successfully", customer });
        
    } catch (error) {
        console.error(error);
        resp.status(500).json({ message: "Server error" });
    }
};

const updateBilling = async (req, resp) =>{
    const session = await mongoose.startSession();
    session.startTransaction();
    const {billingDate , updateBillingDate, customer_id} = req.body;
    const customer = await findCustomerById(customer_id);
    if (!customer) return handleNotFound(resp, 'Customer not found');

    const activePlan = await findCurrentActivePlan(customer_id);
    if (!activePlan) return resp.status(500).json({message: 'No Active Plan'});

    if(activePlan.type == 'PayAsYouGo')
    {
        await Customer.updateOne(
            { _id: customer_id, 'pricingPlans.isActive': true },
            {
                $set: {
                    'pricingPlans.$.renewalDate': updateBillingDate,
                }
            },
        )
        return resp.status(200).json({'message': 'Billing Cycle Updated for the user'});
    }
    else if(activePlan.type == 'Package')
    {
        try
        {
            console.log(activePlan.planId)
            const plan = await findPlanById(activePlan.planId);
    
            const {proRatedPrice, proRatedInterviews} = calculateProration(new Date(billingDate), new Date(updateBillingDate), plan)
            console.log(activePlan)
            let note = `Billing Cycle changed from ${billingDate} to $ ${updateBillingDate}`
            await handleTransactionPayment(session, customer_id, parseInt(proRatedPrice), 'ChangeBillingCycle', note)
            await Customer.updateOne(
                { _id: customer_id, 'pricingPlans.isActive': true },
                {
                    $set: {
                        'pricingPlans.$.renewalDate': updateBillingDate,
                    },
                    $inc: {
                        'pricingPlans.$.details.interviewsPerQuota': proRatedInterviews,
                    },
                },
                {session}
            )
            await session.commitTransaction();
            session.endSession();
        }
        catch(error)
        {
            console.log(error);
        }
    }
    
}

const changeInterViewRate = async(customerId, interviewRate) =>{
    try
    {
        const currentDate = new Date();
        const customer = await findCustomerById(customerId);
        if (!customer) return handleNotFound(resp, 'Customer not found');
    
        const activePlan = await findCurrentActivePlan(customerId);
    
        if(activePlan.type=='PayAsYouGo')
        {
    
            await Customer.updateOne(
                { _id: customerId, 'pricingPlans.isActive': true },
                { $set: 
                    { 
                        'pricingPlans.$.isActive': false
                    } 
                },
            );
    
            const date = new Date(); 
            const newCustomerPlan = {
                planId: activePlan._id,
                startDate: date,
                endDate: null,
                type: 'PayAsYouGo',
                isActive: true,
                details: {
                    name: activePlan.name,
                    interviewRate: interviewRate,
                },
                renewalDate: activePlan.renewalDate,
            };
        
            customer.pricingPlans.push(newCustomerPlan);
            await customer.save();    
        }
    }
    catch(error)
    {
        console.log(error)
        console.log('her');
    }

}

const calculateProration = (currentDate, proRatedEndDate, plan) => {
    if(plan.type=='Package')
    {
        const quotaValidityInDays = plan.quotaValidity === 'monthly' ? 30 : 365;   
        const oneDay = 24 * 60 * 60 * 1000;
        const daysInPeriod = Math.round(Math.abs((proRatedEndDate - currentDate) / oneDay));
        
        const dailyCost = plan.price / quotaValidityInDays;
        const dailyInterviews = plan.interviewsPerQuota / quotaValidityInDays;
        
        const proRatedPrice = Math.round(dailyCost * daysInPeriod);
        const proRatedInterviews = Math.round(dailyInterviews * daysInPeriod);

        return {
            proRatedPrice,
            proRatedInterviews
        };
    }
};
module.exports = {
    customerTransactions,
    topUp,
    updateCustomer,
    updateBilling
}
