/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Dependencies
require('dotenv').config({silent: true});
var express = require('express');  // app server
var bodyParser = require('body-parser');  // parser for post requests
var watson = require('watson-developer-cloud');  // watson sdk

// Express application
var app = express();

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper
var conversation = watson.conversation({
  url: 'https://gateway.watsonplatform.net/conversation/api',
  username: process.env.CONVERSATION_USERNAME || '<username>',
  password: process.env.CONVERSATION_PASSWORD || '<password>',
  version_date: '2016-07-11',
  version: 'v1'
});

// App-specific settings
var DEBUG = process.env.DEBUG == 'true' || false;  // Debug the app (excluding the Weather Underground Util)
var weatherUtil = require('./lib/weatherUtil'); // Require the Weather Underground Util
var WU_API_KEY = process.env.WEATHER_UNDERGROUND_API_KEY || null; // Get Weather Underground API key from the .env file
var DEBUG_UTIL = process.env.DEBUG_UTIL == 'true' || false; // Debug the Weather Underground Util

// Endpoint to be called from the client side
app.post('/api/message', function(req, res) {
  
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({'output': {'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' +
    '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' +
      'Once a workspace has been defined the intents may be imported from ' +
    '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'}});
  }
  var payload = {
    workspace_id: workspace,
    context: {}
  };
  if (req.body) {
    if (req.body.input) {
      payload.input = req.body.input;
    }
    if (req.body.context) {
      // The client must maintain context/state
      payload.context = req.body.context;
    }
  }
  // Send the input to the conversation service
  conversation.message(payload, function(err, data) {
    
    if (err) {  // return error if any
      return res.status(err.code || 500).json(err);
    }
    if(DEBUG) console.log(data.output.text);

    if(data.output.action == 'get_weather')             // if Watson Conversation set output.action to 'get_weather',
      makeWeatherRequest(data, function(responseText){    // then make a weather request using the JSON data, and get the responseText to display
        if(DEBUG) console.log(responseText);
        
        /**
         * We can display multiple separate text lines in the app,
         * so set data.output.text to be an array of strings
         * if the responseText is already an array, then just set that to be the output
         * else if the responseText is a string:
         *  - take the last element from data.output.text (Which states the intent and entities that Watson Conversation inferred)
         *  - and tack on responseText so that those two lines are displayed in the chat response
         */
        if(responseText instanceof Array) data.output.text = responseText
        else data.output.text = [data.output.text[data.output.text.length - 1], responseText];
        
        res.json(data); // respond with the JSON data
      });

    else {                                                              // if we are not yet ready to get the weather, (i.e. still in the dialog)
      data.output.text = data.output.text[data.output.text.length - 1];   // then set the output to be the last element in the array of output text strings
      res.json(data);                                                     // and respond with the JSON data
    }
  });
});

/**
 * Function to make the weather request
 * @param {HashMap} data: contains the parameters to be used in the weather request, contained in the context field 
 * @param {Function} callback: to be called when we have the response from the weather util
 */
function makeWeatherRequest(data, callback){
  
  if(data.context.city instanceof Array)
    data.context.city = data.context.city[data.context.city.length-1].value;  // set the city to be the value of the last element in the array
  
  if (data.context.state && data.context.state instanceof Array){
    var state = null;
    var state_city_mismatches = data.context.state.filter(function (x){ return x.value != data.context.city });  // get the number of states that do not match the city
    if(state_city_mismatches.length > 0)
      state = state_city_mismatches[state_city_mismatches.length-1].value;
    else {
      var state_city_matches = data.context.state.filter(function (x){ return x.value == data.context.city });  // get the number of states that match the city
      if(state_city_matches.length >= 2)
        state = state_city_matches[state_city_matches.length-1]; // set the state to be the value of the last element in the array
    }
    data.context.state = state;
  }

  // set the last line of the output text ("<Condition> in ") to include the updated city and state
  data.output.text[data.output.text.length - 1] += data.context.city;
  
  // make the weather request
  if(DEBUG) console.log("Making weather request for " + data.context.condition + "," + data.context.city + "," + data.context.state + "," + data.context.date);
	weatherUtil.makeWeatherRequest(WU_API_KEY, data.context.condition, data.context.city, data.context.state, data.context.date, DEBUG_UTIL, 
  function(weather_reply, state){                      // callback function called from the weatherUtil
    if(state) data.output.text[data.output.text.length - 1] += ", " + state;
    data.output.text[data.output.text.length - 1] += ":";

    if(weather_reply.ask) {                       // if we need to ask the user a question
      data.context.asked_state = true;              // set the asked_state context varaible to true
      // data.context.options = weather_reply.options; // set the options of what to ask (TODO: use in Watson Conversation Dialog)
      callback(weather_reply.ask);                  // call the callback function with the output text (weather_reply.ask)
    } else                                        // if don't need to ask a question,
      callback(weather_reply.tell);                 // call the callback function with the output text (weather_reply.tell)
  });
}

module.exports = app;
