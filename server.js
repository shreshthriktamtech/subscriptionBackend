require('dotenv').config();
const express = require('express')
const router = require('./routes/app')
const cors = require('cors')
require('./config/db')
const app = express()
const PORT = process.env.PORT || 5000
// const { renewPlanCronJob } = require('./crons/renewPlan')

app.use(cors())
app.use(express.json())
app.use(express.urlencoded(extend=true))
app.use('/api', router)

app.listen(PORT, ()=>{
    console.log(`Server is listening at PORT ${PORT}`)
})
