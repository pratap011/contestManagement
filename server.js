const express = require('express');
const dotenv = require('dotenv');
const userRoute = require('./route/userRoute');
const contestRoute  = require('./route/contestRoute'); 
const prizeRoute = require('./route/prizeRoute');
const questionRoute = require('./route/questionRoute');
const submissionRoute = require('./route/submissionRoute');
const connectDB=require('./config/db');



const app = express();
dotenv.config();
app.use(express.json());
//Connect to database
connectDB();

app.get("/",(req,res)=>{
    res.send("Greetings, you have reached the home page of ContestManagement");
})
app.use("/user",userRoute);
app.use("/contest",contestRoute);
app.use("/prize",prizeRoute);
app.use("/question",questionRoute);
app.use("/participate",submissionRoute);

app.listen(process.env.PORT,(error)=>{
    if(error){
        console.log(`Failed to start server due to: ${error}`);
    }
    else{
        console.log(`Server started succesfully in port ${process.env.PORT}`);
    }
});

