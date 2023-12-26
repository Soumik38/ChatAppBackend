const mongoose=require('mongoose')
const messageSchema=mongoose.Schema({
    conversationId:{
        type:String,
        required:true,
    },senderId:{
        type:String,
        required:true
    },text:{
        type:String,
        required:true,
    }
})
const Messages=mongoose.model('Message',messageSchema)
module.exports=Messages