const { default: mongoose } = require("mongoose");
const Customer = require("../models/Customer");
const { 
    findCustomerById, 
    findPlanById, 
    isActivePlan, 
    calculateProration, 
    createNewPackagePlan, 
    createNewPayAsYouGoPlan, 
    billGeneration, 
    calculateRenewalDate, 
    findCurrentActivePlan, 
    createPackagePlan, 
    createPayAsYouGoPlan, 
    changePlan, 
    renewProRatedPackagePlan, 
    renewProRatedPayAsYouGoPlan, 
    handleTransactionPayment, 
    renewPackagePlan, 
    bonusTopUp, 
    getNotes } = require("../utils/helper");
const Transaction = require("../models/Transaction");
const Plan = require("../models/Plan");



// function to get the current active plan for the customer
const currentActivePlan = async (data) => {
    const { customerId } = data;

    try {
        const session = await mongoose.startSession();
        session.startTransaction();

        const customer = await findCustomerById(session, customerId);
        if (!customer)
        {
            throw new Error('Customer Not found')
        }

        const activePlan = await findCurrentActivePlan(session, customerId);
        if (!activePlan)
        {
            throw new Error('No Active plan found')
        }
        
        return activePlan;

    } catch (error) {
        throw new Error(error.message)
    }
};


// assign a plan to customer
const assignPlanToCustomer = async (data) =>{
    const {
        planId,
        customerId,
        isProRated,
        proRatedEndDate,
        bonus
    } = data;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let note = "";
        const customer = await findCustomerById(session, customerId);
        if (!customer) {
            throw new Error('Customer not found')
        }

        const plan = await findPlanById(session, planId);
        if (!plan) {
            throw new Error('Plan not found')
        }

        const isActive = await isActivePlan(session, customerId);
        if (isActive) {
            throw new Error('Already have Active Plan');
        }

        const date = new Date();
        if(parseInt(bonus)>0)
        {
            await bonusTopUp(session, customerId, bonus);
        }
        if (plan.type === 'Package') {

            if (isProRated) {
                const { proRatedPrice, proRatedInterviews } = calculateProration(date, new Date(proRatedEndDate), plan);
                
                if (proRatedPrice && proRatedInterviews) {
                    plan.price = Math.round(proRatedPrice);
                    plan.interviewsPerQuota = Math.round(proRatedInterviews);
                }
            }
            note = `Package Assigned ${plan.name}`;
            note = `${getNotes('AssignPackage')} ${plan.name}`;
            await handleTransactionPayment(session, customerId, plan.price, "AssignPackage", note);
            
            if (customer.paymentType === 'Prepaid') {

                await billGeneration(session, customerId);
                console.log('transaction done');
            }

            const renewalDate = isProRated ? proRatedEndDate : calculateRenewalDate(date, plan.quotaValidity)
            await createNewPackagePlan(session, customerId, plan, renewalDate, isProRated)

        } else if (plan.type === 'PayAsYouGo') {

            const renewalDate = isProRated ? proRatedEndDate : calculateRenewalDate(date, "monthly")
            await createNewPayAsYouGoPlan(session, customerId, plan, renewalDate, isProRated)
        }

        await session.commitTransaction();
        session.endSession();

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error(`Error assigning plan: ${error.message}`);
        throw new Error(error.message)
    }
}



// get the details of the plan while assigning
const getPlanDetails = async (data) => {
    try
    {
        const { 
            customerId, 
            planId, 
            isProRated, 
            proRatedEndDate 
        } = data;

        const customer = await Customer.findById(customerId);
        if (!customer) {
            throw new Error('Customer not found')
        }
    
        const plan = await Plan.findById(planId);
        if (!plan) {
            throw new Error('Plan not found')
        }
    
        let planData;
    
        if (plan.type === 'Package') {
    
            let price = plan.price;
            let interviewsIncluded = plan.interviewsPerQuota;
    
            if (isProRated && proRatedEndDate) {
                const currentDate = new Date();
                const { proRatedPrice, proRatedInterviews } = calculateProration(currentDate, new Date(proRatedEndDate), plan);
                price = proRatedPrice;
                interviewsIncluded = proRatedInterviews;
            }
    
            planData = {
                'Name of Package': plan.name,
                'Price of Package': price,
                'Quota Validity': plan.quotaValidity,
                'Interviews Included': interviewsIncluded,
                'Additional Interview Rate': plan.additionalInterviewRate, 
            };
        }
        if (plan.type === 'PayAsYouGo') {

            let interviewRate = customer.interviewRate || plan.interviewRate;
            planData = {
                'Name of Package': plan.name,
                'Interview Rate': interviewRate,
            };
        }
        return planData ;
    }
    catch (error) {
        console.error(`Error while fetching the plan details: ${error.message}`);
        throw new Error(error.message)
    }
}


// create a new plan
const createPlan = async (data) => {
    try {

        const session = await mongoose.startSession();
        session.startTransaction();
        
        const {
            name,
            price,
            type,
            interviewRate,
            additionalInterviewRate,
            quotaValidity,
            interviewsPerQuota
        } = data;

        if(type=='Package')
        {
            await createPackagePlan(session, data)
        }
        else if(type=='PayAsYouGo')
        {
            await createPayAsYouGoPlan(session, data)
        }

        await session.commitTransaction();
        session.endSession();

    } catch (error) {
        console.log(`Error while creating a plan ${error.message}`)
        await session.abortTransaction();
        session.endSession();
        throw new Error('Not able to create a plan')
    }
};


// get the plans
const getPlans = async ()=>{
    try{

        const plans = await Plan.find({isActive: true})
        return plans;
    }
    catch(error)
    {
        console.log(`Unable to fetch plans ${error.message}`)
        throw new Error('Unable to fetch plans')
    }
}


// Generate Bill
const generateBill = async (data) => {
    try
    {
        const { customerId } = data;

        const session = await mongoose.startSession();
        session.startTransaction();

        await billGeneration(session, customerId);

        await session.commitTransaction();
        session.endSession();
    }
    catch(error)
    {
        await session.abortTransaction();
        session.endSession();
        console.log(`Error generating bills ${error.message}`)
        throw new Error('Error whike generating the bill')
    }
}


const renewPlan = async (data) => {
    const { customerId } = data;
    let session;

    try {

        session = await mongoose.startSession();
        session.startTransaction();


        const customer = await findCustomerById(session, customerId);

        if (!customer) {
            throw new Error('Customer not found')
        }

        const activePlan = await findCurrentActivePlan(session, customerId);

        if(customer?.changePlanRequest?.isActive){
            await changePlan(session, customerId, activePlan)
        }

        else if(activePlan.isProRated)
        {
            // Renew a proRated Package Plan
            if(activePlan.type=='Package') {
                await renewProRatedPackagePlan(session, customerId, activePlan);
            }

            // Renew a proRated PayAsYouGo Plan
            if(activePlan.type=='PayAsYouGo') {
                await renewProRatedPayAsYouGoPlan(session, customerId, activePlan);
            }
        }

        // Renew a PayAsYouGo plan
        else if(activePlan.type=='PayAsYouGo') {
            await billGeneration(session, customerId);
        }

        // Renew a package Plan
        else if (activePlan.type == 'Package') {
            await renewPackagePlan(session, customerId, activePlan);
        }

        await session.commitTransaction();
        session.endSession();

    } catch (error) {
        if(session)
        {
            await session.abortTransaction();
            session.endSession();
        }
        console.error(`Error in renewing the plan: ${error.message}`);
        throw new Error(error.message)
    }
};


const planChangeRequest = async (data) => {
    const { customerId, planId } = data;
    let session;

    try {
        session = await mongoose.startSession();
        session.startTransaction();

        const currentDate = new Date();


        const customer = await findCustomerById(session, customerId);
        if (!customer){
            throw new Error ('Customer not found')
        };

        const activePlan = await findCurrentActivePlan(session, customerId);
        if(!activePlan)
        {
            throw new Error ('Active Plan not found')
        }
        if(planId == activePlan.planId)
        {
            throw new Error ('Same Plan already activated for user');
        }

        details = {
            isActive: true,
            planId: planId,
            requestedDate:currentDate
        }

        customer.changePlanRequest = details;
        await customer.save({session});

        await session.commitTransaction();
        session.endSession();

    } catch (error) {
        if(session)
        {
            await session.abortTransaction();
            session.endSession();
        }
        console.log(`Plan change request failed ${error.message}`)
        throw new Error(error.message)
    }
};







module.exports = {
    assignPlanToCustomer,
    getPlanDetails,
    createPlan,
    getPlans,
    generateBill,
    currentActivePlan,
    renewPlan,
    planChangeRequest
}