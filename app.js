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

require('dotenv').config({silent: true});

var express = require('express');  // app server
var bodyParser = require('body-parser');  // parser for post requests
var watson = require('watson-developer-cloud');  // watson sdk

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

var DEBUG = false;
var weatherUtil = require('./lib/weatherUtil');
var WU_API_KEY = process.env.WEATHER_UNDERGROUND_API_KEY || null;
var DEBUG_UTIL = false;

// Endpoint to be call from the client side
app.post('/api/message', function(req, res) {
  
  var workspace = process.env.MINI_WORKSPACE_ID || '<workspace-id>';
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
    if (err) {
      return res.status(err.code || 500).json(err);
    }
    if(DEBUG) console.log(data.output.text);

    if(data.output.action == 'get_weather')
      makeWeatherRequest(data, function(responseText){
        if(DEBUG) console.log(responseText);
        
        if(responseText instanceof Array)
          data.output.text = responseText
        else
          data.output.text = [data.output.text[data.output.text.length - 1], responseText];
        
        res.json(data);
      });
    else{
      data.output.text = data.output.text[data.output.text.length - 1];
      res.json(data);
    }
  });
});

function makeWeatherRequest(data, callback){
	weatherUtil.makeWeatherRequest(WU_API_KEY, data.context.condition, data.context.city, data.context.state, data.context.date, DEBUG_UTIL, function(weather_reply){
      if(weather_reply.ask) {
        data.context.asked_state = true;
        data.context.options = weather_reply.options;
        callback(weather_reply.ask);
      } else
        callback(weather_reply.tell);
  });
}

module.exports = app;
