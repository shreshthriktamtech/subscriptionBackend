const express = require('express')
const { consumeInterview } = require('../controllers/comsumeController')
const { createPlan, getPlans, currentActivePlan, renewActivePlan, assignPlan, planChangeRequest, changePlanRequest, getPlanDetails } = require('../controllers/planController')
const { createCustomer, getCustomers, getCustomer, resetAccount, userPlans } = require('../controllers/customerController')
const { customerTransactions, topUp, updateCustomer, updateBilling } = require('../controllers/transactionController')
const { generateBill, customerBills, payBill } = require('../controllers/invoiceController')


const router = express.Router()


router.post('/create-plan', createPlan)
router.get('/plans', getPlans)
router.post('/create-customer', createCustomer)
router.get('/customers', getCustomers)
router.post('/current-active-plan', currentActivePlan)
router.post('/customer-details', getCustomer)
router.post('/transactions', customerTransactions)
router.post('/topup', topUp)
router.post('/billing', generateBill)
router.post('/bills', customerBills)
router.post('/renew-plan', renewActivePlan)
router.post('/assign-plan', assignPlan)
router.post('/customer', getCustomer)
router.post('/account-reset', resetAccount)
router.post('/plan-details', getPlanDetails)
router.post('/user-plans', userPlans)
router.post('/change-plan', planChangeRequest)

router.post('/change-plan-request', changePlanRequest)
router.put('/update-customer/:id', updateCustomer);
router.post('/update-billing/', updateBilling);
router.post('/pay-bill', payBill)

router.post('/consume-interview', consumeInterview)


module.exports = router