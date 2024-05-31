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
        console.log(`Starting plan renewal process for customer ${customerId}`);

        session = await mongoose.startSession();
        session.startTransaction();
        console.log('Transaction started');

        const customer = await findCustomerById(session, customerId);
        console.log('Customer fetched:', customer);

        if (!customer) {
            throw new Error('Customer not found');
        }

        const activePlan = await findCurrentActivePlan(session, customerId);
        console.log('Current active plan fetched:', activePlan);

        if (customer?.changePlanRequest?.isActive) {
            console.log('Change plan request is active for customer', customerId);
            await changePlan(session, customerId, activePlan);
            console.log('Plan changed for customer', customerId);
        } else if (activePlan.isProRated) {
            console.log('Active plan is prorated for customer', customerId);

            if (activePlan.type == 'Package') {
                console.log('Renewing prorated package plan for customer', customerId);
                await renewProRatedPackagePlan(session, customerId, activePlan);
                console.log('Prorated package plan renewed for customer', customerId);
            } else if (activePlan.type == 'PayAsYouGo') {
                console.log('Renewing prorated pay-as-you-go plan for customer', customerId);
                await renewProRatedPayAsYouGoPlan(session, customerId, activePlan);
                console.log('Prorated pay-as-you-go plan renewed for customer', customerId);
            }
        } else if (activePlan.type == 'PayAsYouGo') {
            console.log('Renewing pay-as-you-go plan for customer', customerId);
            await billGeneration(session, customerId);
            console.log('Pay-as-you-go plan renewed for customer', customerId);
        } else if (activePlan.type == 'Package') {
            console.log('Renewing package plan for customer', customerId);
            await renewPackagePlan(session, customerId, activePlan);
            console.log('Package plan renewed for customer', customerId);
        }

        await session.commitTransaction();
        session.endSession();
        console.log(`Transaction committed and session ended. Plan renewed for customer ${customerId}`);

    } catch (error) {
        if (session) {
            console.log('Aborting transaction due to error');
            await session.abortTransaction();
            session.endSession();
            console.log('Transaction aborted and session ended');
        }
        console.error(`Error in renewing the plan for customer ${customerId}: ${error.message}`);
        throw new Error(error.message);
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