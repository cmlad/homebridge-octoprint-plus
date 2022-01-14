var Service, Characteristic;
var axios = require("axios");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  // registration of each accessory
  homebridge.registerAccessory("homebridge-octoprint-plus", "OctoPrintPlus", OctoPrintPlus);
}

//**************************************************************************************************
// General Functions
//**************************************************************************************************



//**************************************************************************************************
// Bricklet Remote Switch
//**************************************************************************************************

function OctoPrintPlus(log, config) {
  this.log = log;

  // parse config
  this.name = config["name"];
  this.server = config["server"] || 'http://localhost:5000';
  this.apiKey = config["api_key"];
  this.allowPause = config["allow_pause"];
  this.allowCancel = config["allow_cancel"];

  log.info("Initialized OctoPrint Plus Accessory at " + this.server);
}

OctoPrintPlus.prototype = {
  getServices: function() {

    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Guy Sheffer and the Community")
      .setCharacteristic(Characteristic.Model, "OctoPrint");

    this.controlService = new Service.Lightbulb();

    this.controlService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPrintingState.bind(this))
      .on('set', this.setPrintingState.bind(this));

    this.controlService
      .getCharacteristic(Characteristic.Brightness)
      .on('get', this.getProgress.bind(this))
      .on('set', this.setProgress.bind(this));

    // set name
    this.controlService.setCharacteristic(Characteristic.Name, this.name);

    return [informationService, this.controlService];
  },

  refreshState() {
    this.getPrintingState(function(a, b) {
      this.controlService.getCharacteristic(Characteristic.On).updateValue(b);
    }.bind(this));
    this.getProgress(function(a, b) {
      this.controlService.getCharacteristic(Characteristic.Brightness).updateValue(b);
    }.bind(this));
  },

  refreshStateWithDelay() {
    setTimeout(function() {
      this.refreshState();
    }.bind(this), 2000);
  },

  // This function gets the current printing state (1 = printing, 0 = not printing)
  getPrintingState(callback) {
    var self = this;
    self.log('Getting current printing state: GET ' + this.server + '/api/printer');

    var options = {
      method: 'GET',
      url: this.server + '/api/printer',
      headers: {
        "X-Api-Key": this.apiKey
      },
      json: true
    };

    axios.request(options).then(function(printState) {
        var state = printState.data.state.flags.printing;
        self.log("Printer is printing: " + state)
        if (state == false) {
          callback(null, 0);
        } else {
          callback(null, 1);
        }
      })
      .catch(function(error) {
        self.log("Error getting printing state, assuming not printing");
        callback(null, 0);
      });
  },

  setPrintingState(value, callback) {
    var self = this;
    if (!this.allowPause){
      self.log("Pausing disabled.");
      self.refreshState();
      callback(null);
    } else if (value == 1) {
      self.log("Resuming print.");
      var options = {
        method: 'POST',
        url: this.server + '/api/job',
        headers: {
          "X-Api-Key": this.apiKey
        },
        body: {
          "command": "resume"
        },
        json: true
      };
      axios.request(options).then(function(printState) {
          self.log("Print resumed successfully.")
          self.refreshState();
          callback(null);
        })
        .catch(function(error) {
          self.refreshState();
          callback(error);
        });
    } else {
      self.log("Pausing print.");
      var options = {
        method: 'POST',
        url: this.server + '/api/job',
        headers: {
          "X-Api-Key": this.apiKey
        },
        body: {
          "command": "pause"
        },
        json: true
      };
      axios.request(options).then(function(printState) {
          self.log("Print paused successfully.")
          self.refreshState();
          callback(null);
        })
        .catch(function(error) {
          self.refreshState();
          callback(error);
        });
    }
  },

  getProgress(callback) {
    var self = this;
    self.log('Getting current job data: GET ' + this.server + '/api/job');

    var options = {
      method: 'GET',
      url: this.server + '/api/job',
      headers: {
        "X-Api-Key": this.apiKey
      },
      json: true
    };

    axios.request(options).then(function(printState) {
        var completion = printState.data.progress.completion;
        if (completion == null) {
          self.log("Printer currently not printing.")
          callback(null, 0);
        } else {
          self.log("Current completion: " + JSON.stringify(completion));
          completionInt = Math.round(parseFloat(completion));
          callback(null, completionInt);
        }
      })
      .catch(function(error) {
        self.log("Error getting printing progress, assuming not printing");
        callback(null, 0);
      });
  },

  setProgress(value, callback) {
    var self = this;
    self.log("Setting value to " + value);
    if (!this.allowCancel){
      self.log("Canceling disabled.");
      self.refreshState();
      callback(null)
    } else if (value === 100) {
      self.log("Cancelling print.");
      var payload = {
        "command": "cancel"
      };
      var options = {
        headers: {
          "X-Api-Key": this.apiKey
        }
      };
      axios.post(this.server + '/api/job', payload, options).then(function(printState) {
        self.log("Print cancelled successfully.")
          self.refreshStateWithDelay();
          callback(null);
        })
        .catch(function(error) {
          self.log("Error canceling print, assuming not printing");
          self.log(error);
          self.refreshStateWithDelay();
          callback(null);
        });
    } else {
      self.log("Cannot set custom progress!");
      self.refreshState();
      callback(1);
    }
  }
}
