/*───────────────────────────────────────────────────────────────────────────*\
 │  Copyright (C) 2014 eBay Software Foundation                                │
 │                                                                             │
 │                                                                             │
 │   Licensed under the Apache License, Version 2.0 (the "License"); you may   │
 │   not use this file except in compliance with the License. You may obtain   │
 │   a copy of the License at http://www.apache.org/licenses/LICENSE-2.0       │
 │                                                                             │
 │   Unless required by applicable law or agreed to in writing, software       │
 │   distributed under the License is distributed on an "AS IS" BASIS,         │
 │   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  │
 │   See the License for the specific language governing permissions and       │
 │   limitations under the License.                                            │
 \*───────────────────────────────────────────────────────────────────────────*/
'use strict';

var async = require('async'),
  Setup = require('./setup'),
  debug = require('debug'),
  log = debug('nemo:log'),
  error = debug('nemo:error'),
  _ = require('lodash'),
  path = require('path'),
  confit = require('confit'),
  webdriver = require('selenium-webdriver');

error.log = console.error.bind(console);

/**
 * Represents a Nemo instance
 * @constructor
 * @param {Object} config - Object which contains any plugin registration and optionally nemoData
 *
 */

function Nemo(config, cb) {
  if (arguments.length === 1) {
    cb = arguments[0];
  }
  log('new Nemo instance created', JSON.stringify(config));

  var nemo = {
    'data': {},
    'view': {},
    'locator': {},
    'driver': {},
    'wd': webdriver
  };
  var basedir = path.join(process.env.nemoBaseDir, 'config');
  console.log('basedir', basedir);
  confit(basedir).create(function (err, config) {
    config.get; // Function
    config.set; // Function
    config.use; // Function

    //console.log(config.get('plugins')); // 'development'
    stuffs.setup(config).then(function(_nemo) {
      _.merge(nemo, _nemo);
      cb();
    });
  });

  return nemo;


}
var stuffs = {
  /**
   *
   * setup
   * @param {Object} config -
   *  {
     *    'view': ['example-login', 'serviceError']   //optional
     *    ,'locator': ['wallet']                      //optional
     *    ,<plugin config namespace>: <plugin config> //optional, depends on plugin setup
     *  }
   *@returns webdriver.promise - successful fulfillment will return an {Object} as below:
   *  {
     *    'view': {}                           //view instances if specified in config
     *    ,'locator': {}                       //locator instances if specified in config
     *    ,'driver': {}                        //driver instance. ALWAYS
     *    ,'wd': {}                            //static reference to selenium-webdriver. ALWAYS
     *    ,<plugin namespace>: <plugin object> //if plugin registers
     *  }
   */
  setup: function setup(config) {
    var waterFallArray = [],
      preDriverArray = [],
      postDriverArray = [],
      plugins = {};
    //config is for registering plugins
    if (config && config.get('plugins')) {
      plugins = config.get('plugins');
    }
    var driver = config.get('driver');
    console.log('driver', driver);
    config = config || {};
    var me = this,
      nemo = {
        'data': config.get('data'),
        'view': {},
        'locator': {},
        'driver': null,
        'wd': webdriver
      };
    var d = webdriver.promise.defer();
    preDriverArray = [datasetup];

    Object.keys(plugins).forEach(function pluginsKeys(key) {
      var modulePath,
        pluginConfig,
        pluginModule;

      if ((plugins[key].register || config[key]) || key === 'view') {
        log('register plugin %s', key);
        //register this plugin
        pluginConfig = plugins[key];
        modulePath = pluginConfig.module;
        pluginModule = require(modulePath);
        if (plugins[key].priority && plugins[key].priority < 100) {
          preDriverArray.push(pluginModule.setup);
        } else {
          postDriverArray.push(pluginModule.setup);
        }
      }
    });
    waterFallArray = preDriverArray.concat([driversetup], postDriverArray);
    if (config.view || (plugins && plugins.view)) {
      waterFallArray.push(viewsetup);
    }
    if (config.locator) {
      waterFallArray.push(locatorsetup);
    }
    async.waterfall(waterFallArray, function waterfall(err, result) {
      if (err) {
        d.reject(err);
      } else {
        d.fulfill(nemo);
      }
    });
    return d;

    //waterfall functions
    function datasetup(callback) {
      callback(null, config, nemo);
    }

    function driversetup(config, _nemo, callback) {
      //do driver/view/locator/vars setup
      (Setup()).doSetup(webdriver, driver, function setupCallback(err, _nemo) {
        if (err) {
          callback(err);
        } else {
          //set driver
          nemo.driver = _nemo.driver;
          callback(null, config, nemo);
        }
      });
    }

    function locatorsetup(config, _nemo, callback) {
      //setup locators
      config.locator.forEach(function (key) {
        nemo.locator[key] = require(nemo.props.autoBaseDir + '/locator/' + key);
      });
      callback(null, config, nemo);
    }

    function viewsetup(config, _nemo, callback) {
      var viewModule = _nemo.view;
      if (!config.view) {
        config.view = [];
      }
      //setup views
      config.view.forEach(function viewKeys(key) {
        if (plugins.view) {
          //process with the view interface
          viewModule.addView(key);
        } else {
          //old views
          //dedupe step
          if (nemo.view[key]) {
            return;
          }
          var viewMod = require(nemo.props.autoBaseDir + '/view/' + key);
          nemo.view[key] = new viewMod(_nemo);
        }

      });
      callback(null, config, nemo);
    }
  }
};
module.exports = Nemo;
