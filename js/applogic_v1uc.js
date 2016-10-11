/** ==========================================================
 * MarkSimGCM  v3.0.0
 * ==========================================================
 * @name MarkSim® GCM online
 * @version 3.0
 * @author Eduardo Quiros-Campos, based on work by Ernesto Giron Echeverry
 * @copyright (c) 2013-2016 ArkiTechTura/Qlands, CCAFS - ILRI - CIAT, P.G. Jones
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ========================================================== */
/* MIGRATION:COMMENT
 These module loads no longer apply, since Google Maps is being loaded in the recommended way,
 without using the Google API generic loader

 google.load("earth", "1");
 google.load("maps", "3.1", {
 other_params: "sensor=false"
 });
 */
dojo.require("esri.tasks.gp");
dojo.require("dojo.parser");
dojo.require("dojo.data.ItemFileReadStore");
    var GeocoderStatusDescription = {
        OK: "The request did not encounter any errors",
        UNKNOWN_ERROR: "A geocoding or directions request could not be successfully processed, yet the exact reason for the failure is not known",
        OVER_QUERY_LIMIT: "The webpage has gone over the requests limit in too short a period of time",
        REQUEST_DENIED: "The webpage is not allowed to use the geocoder for some reason",
        INVALID_REQUEST: "This request was invalid",
        ZERO_RESULTS: "The request did not encounter any errors but returns zero results",
        ERROR: "There was a problem contacting the Google servers"
    },
    GeocoderLocationTypeDescription = {
        ROOFTOP: "The returned result reflects a precise geocode.",
        RANGE_INTERPOLATED: "The returned result reflects an approximation (usually on a road) interpolated between two precise points (such as intersections). Interpolated results are generally returned when rooftop geocodes are unavilable for a street address.",
        GEOMETRIC_CENTER: "The returned result is the geometric center of a result such a line (e.g. street) or polygon (region).",
        APPROXIMATE: "The returned result is approximate."
    },
    MarkSimGCMPathDescription = {},
    webserver = null,
    worldclimPath = null,
    marksimPath = null,
    gcm4dataPath = null,
    geoprocessorServer = null,
    geoprocessorServer2 = null,
    geoprocessorServer3 = null,
    map = null,
    lang, title, copyright, developer,
    geocoder = null,
    elevator = null,
// MIGRATION:COMMENT These two objects were introduced during the migration process to hold the current position,
//                   the current elevation and the current displayed InfoWindow
    marker = null,
    elevation = null,
    infoWindow = null,
//MIGRATION:COMMENT
    clxfile = null,
    currentFile = null,
    arrayDATE = [],
    arraySRAD = [],
    arrayTMAX = [],
    arrayTMIN = [],
    arrayRAIN = [],
    imgRAIN = null,
    imgSRAD = null,
    imgTEMP = null,
    imgTMAX = null,
    imgTMIN = null,
    imgNORMAL =
        null,
    imgPOLAR = null,
    imgCLIMATEDIAGRAMS = null,
    Diagrams = [],
    clouds_lyr = null,
    jsonStore = null,
    Place = null,
    NumRep = null,
    OutDir = null,
    cantClimateCharts = 0;

function el(a) {
    return document.getElementById(a)
}

/**
 * MIGRATION:COMMENT
 * Initialization function for the Google Maps API. Most of the initialization logic from the previous Google Earth
 * callback ('initCallback') now are in this function
 */
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: 25, lng: -40},
        zoom: 3,
        mapTypeId: google.maps.MapTypeId.HYBRID,
        zoomControl: true,
        mapTypeControl: true,
        streetViewControl: true,
        rotateControl: true,
        scaleControl: true,
        draggableCursor: 'crosshair'
    });
    geocoder = new google.maps.Geocoder;
    // The elevator object allows to retrieve metered elevation for the lat/lng where the user clicks
    elevator = new google.maps.ElevationService;
    // Adding click listener to the map object. This handler replaces the 'ClickEventListener' previously installed
    // in the Google Earth object
    map.addListener('click', function (e) {
        mapClickListener(e.latLng, map);
    });
}

/**
 * MIGRATION:COMMENT
 * Click listener for the map Click event. Updates the marker that holds the lat/lng value,
 * and the additional value for elevation
 * This handler replaces the 'ClickEventListener' in the original Google Earth code
 * @param latLng
 * @param map
 */
function mapClickListener(latLng, map) {
    updateMarkers(latLng, map);
    document.forms.input_form.latitude.value = latLng.lat();
    document.forms.input_form.longitude.value = latLng.lng();
    reverseGeoCoding(latLng);
    el("runClimateDiagram").style.display = "block";
    el("runmodel").style.display = "block";
    el("soildata").style.display = "block";
}

/**
 * MIGRATION:COMMENT
 * Utility function to update the current marker object based on a lat/lng
 * The function also updates the elevation object using a second Google Maps API call to the Elevation service
 * @param latLng
 * @param map
 */
function updateMarkers(latLng, map) {
    // first, set the marker to the lat/lng
    marker && marker.setMap(null);
    marker = new google.maps.Marker({
        position: latLng,
        map: map
    });
    // now, set the elevation
    elevation = null;
    elevator.getElevationForLocations({'locations': [latLng]},
        function (results, status) {
            if (status === google.maps.ElevationStatus.OK) {
                if (results[0]) {
                    elevation = results[0];
                }
            }
            else {
                console.log("Error obtaining elevation from ElevationService");
            }
        });
}

function init() {
    if (isIE()) {
        alert('This application works better when accessed with Mozilla Firefox or Google Chrome. Some features might not work well when using Microsoft Internet Explorer');
    }
    setupconfig();
    initYearofSimulation();
    initNumberofReplications();
    showHidePresentDayClimateParams(!1);
}

/**
 * Determines if the code is running on IE
 * @returns boolean if the current browser is IE; false otherwise
 */
function isIE()
{
    var ua = window.navigator.userAgent;
    var msie = ua.indexOf("MSIE ");

    return msie > 0 || window.navigator.userAgent.search(/Trident.*rv\:11\./) > 0;
}

/**
 * Fetches a JSON file using an XMLHttpRequest object
 * @param path The path to the JSON file to load; can be a relative path
 * @param callback The callback to execute once the file is loaded
 */
function fetchJSONFile(path, callback) {
    var httpRequest = isIE() ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest
    httpRequest.onreadystatechange = function() {
        if (httpRequest.readyState === 4) {
            if (httpRequest.status === 200 || httpRequest.status === 0) {
                var data = JSON.parse(httpRequest.responseText);
                if (callback) callback(data);
            }
        }
    };
    httpRequest.open('GET', path);
    httpRequest.send();
}

function setupconfig() {
    fetchJSONFile('config/config.json', function(data) {
        webserver = data.webserver;
        worldclimPath = data.paths.worldclim;
        marksimPath = data.paths.marksim;
        gcm4dataPath = data.paths.gcm4data;
        geoprocessorServer = data.geoprocessor;
        geoprocessorServer2 = data.geoprocessor2;
        geoprocessorServer3 = data.geoprocessor3;
        // MIGRATION:COMMENT Initialization of GeoProcessor objects moved here in order to create them
        // when the appropriate configuration values are available
        gp = new esri.tasks.Geoprocessor(geoprocessorServer);
        gp2 = new esri.tasks.Geoprocessor(geoprocessorServer2);
        gp3 = new esri.tasks.Geoprocessor(geoprocessorServer3);
    });
    MarkSimGCMPathDescription = {
        PATH_TO_WORLDCLIM: worldclimPath,
        PATH_TO_MARKSIM: marksimPath,
        PATH_TO_GCM: gcm4dataPath
    }
}

function reverseGeoCoding(a) {
    geocoder.geocode({
        latLng: a
    }, function (a, c) {
        a ? c == google.maps.GeocoderStatus.OK &&
          (a[0].address_components && 0 < a[0].address_components.length ?
              (document.forms.input_form.place.value = a[0].address_components[0].long_name, el("address").value = "")
              : document.forms.input_form.place.value = el("address").value)
          : alert("Geocoder did not return a valid response")
    })
}

function geocode(a) {
    geocoder.geocode(a, showGeocoderResults)
}

/**
 * MIGRATION:COMMENT
 * Callback function to process geocoding results. This function was renamed from its original
 * 'showResults' name to better indicate its purpose
 * @param results
 * @param status
 */
function showGeocoderResults(results, status) {
    if (results) {
        if (status == google.maps.GeocoderStatus.OK && 0 < results.length) {
            var latLng = results[0].geometry.location;
            updateMarkers(latLng, map);
            map.panTo(latLng);
            map.setZoom(15);
            document.forms.input_form.latitude.value = latLng.lat();
            document.forms.input_form.longitude.value = latLng.lng();
            document.forms.input_form.place.value =
                results[0].address_components && 0 < results[0].address_components.length ?
                    results[0].address_components[0].long_name
                    : el("address").value
        }
    } else alert("Geocoder did not return a valid response")
}

function parseLatLng(a) {
    a.replace("/s//g");
    var b = a.split(",");
    a = parseFloat(b[0]);
    b = parseFloat(b[1]);
    return isNaN(a) || isNaN(b) ? null : new google.maps.LatLng(a, b)
}

function submitQuery() {
    closeSplash();
    var a = el("address").value;
    /\s*^\-?\d+(\.\d+)?\s*\,\s*\-?\d+(\.\d+)?\s*$/.test(a) ?
        (a = parseLatLng(a), null == a ? el("address").value = "" : geocode({latLng: a}))
        : geocode({address: a})
}

/**
 * Updates the current map options based on the user's selection in the UI
 */
function updateOptions() {
    var b = el("options"),
        mapOptions = {
            zoomControl : b.zoom.checked,
            mapTypeControl: b.mapType.checked,
            streetViewControl: b.streetView.checked,
            rotateControl: b.rotate.checked,
            scaleControl: b.scale.checked

    }
    map.setOptions(mapOptions);
}

function initYearofSimulation() {
    for (var a = document.forms.input_form.yearsimulation, b = 2010; 2095 >= b; b++) a.options[a.options.length] = new Option(b, b)
}

function initNumberofReplications() {
    for (var a = document.forms.input_form.numrep, b = 1; 99 >= b; b++) a.options[a.options.length] = new Option(b, b)
}

function initFileListReplications() {
    var a = el("filelist"),
        b = "<div id='linktofile' class='filelist'>";
    a.options.length = 0;
    el("filelistlinks").innerHTML = b;
    for (var c = parseInt(document.forms.input_form.numrep.value), d = 1; d <= c; d++) 10 > d ? (a.options[a.options.length] = new Option("CLIM0" + d + "01", "CLIM0" + d + "01"), b += "<a href=\"javascript:showClimateFileData('CLIM0" + d + "01');\">CLIM0" + d + "01</a><br/>") : (a.options[a.options.length] = new Option("CLIM" + d + "01", "CLIM" + d + "01"), b += "<a href=\"javascript:showClimateFileData('CLIM" +
        d + "01');\">CLIM" + d + "01</a><br/>");
    el("filelistlinks").innerHTML = b + "</div>"
}

/**
 * MIGRATION:COMMENT
 * Shows the 'about' information of the application in an InfoWindow tied to the current marker
 * If there is no marker, one is created with lat=25, lng=-40
 * The Google Earth version of this function used a 'balloon' feature tied to a place mark
 */
function showSplash() {
    if (!marker) {
        marker = new google.maps.Marker({
            position: {lat: 25, lng: -40},
            map: map
        })
    }
    var contentString = "<div style='float:right;'></div><p align='center'><img src=\"./images/ILRI.jpg\"></center></p><br/><blockquote align='justify'>Welcome to the <b>MarkSim\u2122 DSSAT</b> weather file generator. This application uses the well-known <a href='http://gisweb.ciat.cgiar.org/marksim' target='_new'>MarkSim\u2122</a> application (<i>Jones & Thornton 2000, Jones et al 2002</i>) working off a 30 arc-second climate surface derived from WorldClim (<i>Hijmans et al 2005</i>). Point and click on the map and up to 99 WTG files are prepared ready for use with <a href='http://icasa.net/dssat/index.html' target='_new'>DSSAT \u00ae.</a> Download and unpack to a directory on your machine and they are ready for use with the DSSAT4 crop modelling system (<i>Hoogenboom et al 2003</i>).<br/><br/><a href='docs/doc.html' target='blank'>more info...</a></blockquote><br/>";
    infoWindow = new google.maps.InfoWindow({
        content: contentString
    });
    infoWindow.open(map, marker);
}

/**
 * MIGRATION:COMMENT
 * Shows the 'contact us' information of the application in an InfoWindow tied to the current marker
 * If there is no marker, one is created with lat=25, lng=-40
 * The Google Earth version of this function used a 'balloon' feature tied to a place mark
 */
function showContactUs() {
    if (!marker) {
        marker = new google.maps.Marker({
            position: {lat: 25, lng: -40},
            map: map
        })
    }
    var contentString = "\
<div style='float:right;'></div>\n\
<p align='center'><b>Contact Us</b></p> \n\
<blockquote align='justify'>\n\
  If you have any comment or have any particular question regarding the data or the methods, please address an email to the following contact people:<br/><br/>\n\
  <div style='margin:5px;text-align:center;'>\n\
  <img src=\"./images/ILRI-logo.png\"><br/>\n\
</div>\n\
<div style='margin:15px;float:left;'>\n\
  <img src=\"./images/logoCIAT_w.png\"><br/><br/>\n\
  <b>Overall Support</b><br/>\n\
    Peter Gwilym Jones<br/>\n\
    Emeritus Researcher<br/>\n\
    <a href='mailto:p.jones@cgiar.org'>p.jones@cgiar.org</a>\n\
</div>\n\
<div style='float:left;margin-top:15px;margin-left:25px;'>\n\
   <img src=\"./images/logo_ccafs.png\"><br/><br/>\n\
   <b>Technical Support</b><br/>\n\
   Carlos Navarro<br/>\n\
   Research Assistant<br/>\n\
   <a href='mailto:c.e.navarro@cgiar.org'>c.e.navarro@cgiar.org</a>\n\
</div>\n\
</blockquote>";
    infoWindow = new google.maps.InfoWindow({
        content: contentString
    });
    infoWindow.open(map, marker);
}

function closeSplash() {
    if (infoWindow) {
        infoWindow.close();
    }
}

function showHowtouseit() {
    if (!marker) {
        marker = new google.maps.Marker({
            position: {lat: 25, lng: -40},
            map: map
        })
    }
    var contentString = '<div align=\'center\'>You can see the theory by clicking <a href="docs/doc.html" target="_new">How does MarkSim\u00ae work?</a></center></div>';
    contentString += '<blockquote align="justify">';
    contentString += '<p class="parrafo1">';
    contentString += "<b>1.</b> Find your selected place on the map (it\u2019s Google Maps so you\u2019ve got most of the facilities that you\u2019re used to), check that the latitude, longitude and altitude are correct (in mountainous areas you may have to move very slightly to select the correct altitude).";
    contentString +=
        "</p>";
    contentString += '<p class="parrafo1">';
    contentString += '<b>2.</b> Click on Select GCM to choose the GCM combination that you need. There are <a href="docs/doc.html#GCMs" target="_new">17 GCMs available</a>. If you\u2019d like to use just one then tick the relevant box. If you don\u2019t want any GCM, i.e. present climate, just don\u2019t tick any boxes, or don\u2019t even click on Select GCM. You can have an output from any of the 131072 combinations of the GCMs as an ensemble. Just tick those that you need.';
    contentString += "</p>";
    contentString += '<p class="parrafo1">';
    contentString += '<b>3.</b> Choose the emissions scenario. There are four <a href="docs/doc.html#RCPs" target="_new">IPCC Representative Concentration Pathways</a>. RCP\u2019s are greenhouse gas concentration trajectories adopted by the IPCC for its fifth assessment.';
    contentString += "</p>";
    contentString += '<p class="parrafo1">';
    contentString += '<b>4.</b> You can choose a year of simulation. The data produced will simulate daily weather data representative of a <a href="docs/doc.html#StatsAvg" target="_new">statistical average</a> about the year that you select.';
    contentString += "</p>";
    contentString += '<p class="parrafo1">';
    contentString += "<b>5.</b> The number of replication sets the number of DSSAT climate files you will receive (1 to n). They are labeled CLIM0101 through CLIMnn01 \u2013 these do not represent a run of n years but random replicates of the year you have chosen.";
    contentString += "</p>";
    contentString += '<p class="parrafo1">';
    contentString += "<b>6.</b> Google will have chosen a place name for you but you can override that. The place name will be used to name the subdirectory for your simulated files.";
    contentString += "</p>";
    contentString += '<p class="parrafo1">';
    contentString += "<b>7.</b> You can check the data produced in the graphic interface below the map display. If you\u2019re happy with it, download the zipped file.";
    contentString += "</p>";
    contentString += '<p class="parrafo1">';
    contentString += '<b>8.</b> New option. You can output a <a href="docs/doc.html#CLX" target="_new">MarkSim\u00ae CLX file</a>. This option is included for compatibility with a future implementation of MarkSim\u00ae running within DSSAT code. This is not yet operational, but you can produce the requisite CLX file here. If you do it will be the only output from this run. Use the Google place name or choose your own name for the CLX file remembering that it must be less than 8 characters long';
    contentString += "</p>";
    contentString += "</blockquote>";
    infoWindow = new google.maps.InfoWindow({
        content: contentString
    });
    infoWindow.open(map, marker);
}

function clearParameters() {
    document.forms.input_form.latitude.value = "";
    document.forms.input_form.longitude.value = "";
    document.forms.input_form.place.value = "";
    document.forms.input_form.yearsimulation.selectedIndex = 0;
    document.forms.input_form.numrep.selectedIndex = 0;
    document.forms.input_form.clxout.checked = !1;
    selectAllModelGCM(!1);
}

function resetValues() {
    clearParameters();
    clxfile = imgCLIMATEDIAGRAMS = imgPOLAR = imgNORMAL = imgTMIN = imgTMAX = imgTEMP = imgSRAD = imgRAIN = null;
    Diagrams = [];
    map.setOptions({
        center: {lat: 25, lng: -40},
        zoom: 3,
        mapTypeId: google.maps.MapTypeId.HYBRID,
    });
    el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">';
    el("filelistlinks").innerHTML = "";
    el("soildata").style.display = "none";
    el("linktoClimateDiag").innerHTML = "";
    el("td_results").style.display = "none";
    el("td_ClimateDiagramResults").style.display = "none";
    el("td_CLXResults").style.display = "none";
    el("runClimateDiagram").style.display =
        "none";
    el("runmodel").style.display = "none";
    el("shResults").style.display = "none"
}

function get_scenario_value() {
    for (var a = 0; a < document.input_form.scenario.length; a++)
        if (document.input_form.scenario[a].checked) return document.input_form.scenario[a].value
}

function selectAllModelGCM(a) {
    for (var b = 0; b < document.input_form.model.length; b++) document.input_form.model[b].checked = a;
    showHidePresentDayClimateParams(a)
}

function getTemplateofGCMs() {
    for (var a = "", b = "", c = 0; c < document.input_form.model.length; c++) b = document.input_form.model[c].checked ? "1" : "0", a += b;
    return a
}

function RunSoilModel() {
    var b = parseFloat(document.forms.input_form.latitude.value);
    var c = parseFloat(document.forms.input_form.longitude.value);

    updateMarkers({
        lat: b,
        lng: c
    }, map);
    initFileListReplications();
    el("runClimateDiagram").style.display = "none",
        el("soildata").style.display = "none",
        el("runmodel").innerHTML = "<img src='images/progressBar.gif' />";
    computeSoilsService(b, c)
    //}

}

function RunModel(a) {
    el("runClimateDiagram").style.display = "none";
    var b = parseFloat(document.forms.input_form.latitude.value),
        c = parseFloat(document.forms.input_form.longitude.value),
        d = getTemplateofGCMs(),
        e = get_scenario_value(),
        g = document.forms.input_form.yearsimulation.value,
        k = document.forms.input_form.numrep.value,
        h = document.forms.input_form.seed.value,
        f = document.forms.input_form.place.value,
        l = document.forms.input_form.clxout.checked;
    if ("rcp26" != e && "rcp45" != e && "rcp60" != e && "rcp85" != e) alert("Please select a valid Scenario");
    else if (isNaN(b) || isNaN(c)) alert("Please enter a valid number for Latitude or Longitude");
    else if (null == f || "" == f) alert("Please enter a valid name for Place");
    else {
        if (f)
            for (i = 0; i < f.length; i++)
                if ("\\" === f.charAt(i) || "/" === f.charAt(i) || ":" === f.charAt(i) || "*" === f.charAt(i) || "?" === f.charAt(i) || '"' === f.charAt(i) || "<" === f.charAt(i) || ">" === f.charAt(i) || "|" === f.charAt(i)) {
                    alert("A place name can't contain any of the following characters:\n \\ / : * ? \" < > |");
                    return
                }
        updateMarkers({
            lat: b,
            lng: c
        }, map);
        initFileListReplications();
        el("soildata").style.display = "none",
            el("runmodel").innerHTML = "<img src='images/progressBar.gif' />";
        Place = f;
        a ? (el("td_ClimateDiagramResults").style.display = "none", RunClimateDiagram(b, c, d, e, g)) : (el("td_results").style.display = "none", el("td_CLXResults").style.display = "none", computeMarkSimGCMService(b, c, d, e, g, k, h, f, l))
    }
}

function showHideResults() {
    if ("" == el("td_results").style.display && "" == el("td_CLXResults").style.display) el("td_results").style.display = "none", el("td_CLXResults").style.display = "none";
    else if ("none" == el("td_results").style.display && "none" == el("td_CLXResults").style.display) {
        if (null != imgRAIN || null != imgSRAD || null != imgTEMP || null != imgTMAX || null != imgTMIN) el("td_results").style.display = "";
        null != clxfile && (el("td_CLXResults").style.display = "");
        $("html, body").stop().animate({
                scrollTop: $("#td_results").offset().top
            },
            1E3)
    } else if ("" == el("td_results").style.display && "none" == el("td_CLXResults").style.display)
        if ("" == el("td_results").style.display) el("td_results").style.display = "none";
        else {
            if (null != imgRAIN || null != imgSRAD || null != imgTEMP || null != imgTMAX || null != imgTMIN) el("td_results").style.display = "";
            $("html, body").stop().animate({
                scrollTop: $("#td_results").offset().top
            }, 1E3)
        } else "" == el("td_CLXResults").style.display ? el("td_CLXResults").style.display = "none" : (null != clxfile && (el("td_CLXResults").style.display = ""), $("html, body").stop().animate({
                scrollTop: $("#CLXResults").offset().top
            },
            1E3))
}

function showClimateFileData(a) {
    el("info").innerHTML = "<img src='images/loading.gif'/> <h2>Loading...</h2>";
    currentFile = a;
    OutDir && "" != OutDir ? clientSideInclude("ifarchWTG", OutDir + "/" + a + ".txt") : console.log("Output Directory was not found!")
}

function showClimateFileChart(a) {
    el("info").innerHTML = "<img src='images/loading.gif'/> <h2>Loading...</h2>";
    currentFile = a;
    OutDir && "" != OutDir ? clientSideInclude("ifarchWTG", OutDir + "/" + a + ".clx") : console.log("Output Directory was not found!")
}

function onChangeSelectClimateFile() {
    var a = el("filelist").value;
    showClimateFileData(a)
}

function showChart(a) {
    el("info").innerHTML = "<img src='images/loading.gif'/> <h2>Loading...</h2>";
    switch (a) {
        case "RAIN":
            el("info").innerHTML = imgRAIN;
            break;
        case "TEMP":
            el("info").innerHTML = imgTEMP;
            break;
        case "TMAX":
            el("info").innerHTML = imgTMAX;
            break;
        case "TMIN":
            el("info").innerHTML = imgTMIN;
            break;
        case "SRAD":
            el("info").innerHTML = imgSRAD;
            break;
        default:
            el("info").innerHTML = "<img src='images/loading.gif'/> <h2>Loading...</h2>"
    }
}

function createChartRAIN() {
    var a = [];
    for (i = 0; i < arrayRAIN.length; i++) a.push(Math.round(arrayRAIN[i]));
    var b;
    b = "<img id='imgChartRain' src=\"http://chart.apis.google.com/chart?chxt=x,y,x&amp;chs=650x270&amp;chco=0B0B61&amp;chdl=RAIN(mm)&amp;chg=10,20&amp;";
    b += "chxr=1,0," + numberRound(arrayRAIN.max(), 10) + ",10&amp;cht=lc&amp;";
    b += "chds=0," + numberRound(arrayRAIN.max(), 10) + "&amp;";
    b += "chtt=Daily+Rainfall+(" + currentFile + ".WTG)| Replication+" + currentFile.substring(4, 6) + "&amp;";
    b += "chts=0B0B61,15&amp;";
    b += "chxl=0:|1|20|40|60|80|100|120|140|160|200|220|240|260|280|300|320|340|365|";
    b += "2:||Time (days)|&amp;";
    b += "chxs=2,424242,13,0,t&amp;";
    b += "chf=bg,s,EFEFEF&amp;";
    var c = numberRound(arrayRAIN.max(), 10),
        a = "chd=" + simpleEncode(a, c);
    b += a + '"';
    b += "/>";
    el("rdRAIN").checked && (el("info").innerHTML = b);
    imgRAIN = b
}

function createChartSRAD() {
    var a = [];
    for (i = 0; i < arraySRAD.length; i++) a.push(Math.round(arraySRAD[i]));
    var b;
    b = "<img id='imgChartSRad' src=\"http://chart.apis.google.com/chart?chxt=x,y,x&amp;chs=650x270&amp;chco=FE9A2E&amp;chdl=SRAD(MJ/m2)&amp;chg=9.090909,33&amp;";
    b += "chxr=1,0," + numberRound(arraySRAD.max(), 10) + ",10&amp;cht=lc&amp;";
    b += "chds=0," + numberRound(arraySRAD.max(), 10) + "&amp;";
    b += "chtt=Radiation+(" + currentFile + ".WTG)| Replication+" + currentFile.substring(4, 6) + "&amp;";
    b += "chts=FE9A2E,15&amp;";
    b += "chxl=0:|1|20|40|60|80|100|120|140|160|200|220|240|260|280|300|320|340|365|";
    b += "2:||Jan||Feb||Mar||Apr||May||Jun||Jul||Aug||Sep||Oct||Nov||Dec|&amp;";
    b += "chxs=2,424242,13,0,t&amp;";
    b += "chf=bg,s,EFEFEF&amp;";
    var c = numberRound(arraySRAD.max(), 10),
        a = "chd=" + simpleEncode(a, c);
    b += a + '"';
    b += "/>";
    el("rdSRAD").checked && (el("info").innerHTML = b);
    imgSRAD = b
}

function createChartTEMP() {
    var a = [],
        b = [];
    for (i = 0; i < arrayTMAX.length; i++) a.push(Math.round(arrayTMAX[i] + Math.abs(numberRound(arrayTMIN.min(), 10))));
    for (i = 0; i < arrayTMIN.length; i++) b.push(Math.round(arrayTMIN[i] + Math.abs(numberRound(arrayTMIN.min(), 10))));
    var c;
    c = "<img id='imgChartTemp' src=\"http://chart.apis.google.com/chart?chxt=x,y,x&amp;chs=650x270&amp;chco=FF0000,5FB404&amp;cht=lc&amp;chdl=TMAX(C) | TMIN(C)&amp;chg=10,20,1,5&amp;";
    c += "chxr=1," + numberRound(arrayTMIN.min(), 10) + "," + numberRound(arrayTMAX.max(),
            10) + ",10&amp;";
    c += "chds=" + numberRound(b.min(), 10) + "," + numberRound(a.max(), 10) + "&amp;";
    c += "chtt=Temperature+(" + currentFile + ".WTG)| Replication+" + currentFile.substring(4, 6) + "&amp;";
    c += "chts=000000,15&amp;";
    c += "chxl=0:|1|20|40|60|80|100|120|140|160|200|220|240|260|280|300|320|340|365|";
    c += "2:||Time (days)|&amp;";
    c += "chxs=2,424242,13,0,t&amp;";
    c += "chf=bg,s,EFEFEF&amp;";
    var d = numberRound(a.max(), 10),
        a = simpleEncode(a, d),
        b = simpleEncode(b, d),
        b = "chd=" + a + "," + b.substring(2);
    c += b + '"';
    c += "/>";
    el("rdTEMP").checked &&
    (el("info").innerHTML = c);
    imgTEMP = c
}

function createChartTMAX() {
    var a;
    a = "<img id='imgChartTMax' src=\"http://chart.apis.google.com/chart?chxt=x,y,x&amp;chs=650x270&amp;chco=FF0000&amp;chdl=TMAX(C)&amp;chg=9.090909,33&amp;";
    a += "chxr=1," + numberRound(arrayTMAX.min(), 10) + "," + numberRound(arrayTMAX.max(), 10) + ",10&amp;cht=lc&amp;";
    a += "chds=" + numberRound(arrayTMAX.min(), 10) + "," + numberRound(arrayTMAX.max(), 10) + "&amp;";
    a += "chtt=Maximun+Temperature+(" + currentFile + ".WTG)| Replication+" + currentFile.substring(4, 6) + "&amp;";
    a += "chts=FF0000,15&amp;";
    a += "chxl=0:|1|20|40|60|80|100|120|140|160|200|220|240|260|280|300|320|340|365|";
    a += "2:||Time (days)|&amp;";
    a += "chxs=2,424242,13,0,t&amp;";
    a += "chf=bg,s,EFEFEF&amp;";
    var b = "chd=t:";
    for (i = 0; i < arrayTMAX.length; i++) b = i != arrayTMAX.length - 1 ? b + (arrayTMAX[i] + ",") : b + arrayTMAX[i];
    a += b + '"';
    a += "/>";
    el("rdTMAX").checked && (el("info").innerHTML = a);
    imgTMAX = a
}

function createChartTMIN() {
    var a;
    a = "<img id='imgChartTMin' src=\"http://chart.apis.google.com/chart?chxt=x,y,x&amp;chs=650x270&amp;chco=5FB404&amp;chdl=TMIN(C)&amp;chg=9.090909,33&amp;";
    a += "chxr=1," + numberRound(arrayTMIN.min(), 10) + "," + numberRound(arrayTMIN.max(), 10) + ",10&amp;cht=lc&amp;";
    a += "chds=" + numberRound(arrayTMIN.min(), 10) + "," + numberRound(arrayTMIN.max(), 10) + "&amp;";
    a += "chtt=Minimun+Temperature+(" + currentFile + ".WTG)| Replication+" + currentFile.substring(4, 6) + "&amp;";
    a += "chts=5FB404,15&amp;";
    a += "chxl=0:|1|20|40|60|80|100|120|140|160|200|220|240|260|280|300|320|340|365|";
    a += "2:||Time (days)|&amp;";
    a += "chxs=2,424242,13,0,t&amp;";
    a += "chf=bg,s,EFEFEF&amp;";
    var b = "chd=t:";
    for (i = 0; i < arrayTMIN.length; i++) b = i != arrayTMIN.length - 1 ? b + (arrayTMIN[i] + ",") : b + arrayTMIN[i];
    a += b + '"';
    a += "/>";
    el("rdTMIN").checked && (el("info").innerHTML = a);
    imgTMIN = a
}

function numberRound(a, b) {
    var c = 0;
    return c = 0 < a ? Math.ceil(a / b) * b : Math.ceil(a / b) * b - b
}

$(function () {
    $("#tabs").tabs()
});

function clientSideInclude(a, b) {
    var c = !1;
    if (window.XMLHttpRequest) try {
        c = new XMLHttpRequest
    } catch (d) {
        c = !1
    } else if (window.ActiveXObject) try {
        c = new ActiveXObject("Msxml2.XMLHTTP")
    } catch (e) {
        try {
            c = new ActiveXObject("Microsoft.XMLHTTP")
        } catch (g) {
            c = !1
        }
    }
    var k = document.getElementById(a);
    k ? c ? (c.open("GET", b, !1), c.send(null), !1 == document.forms.input_form.clxout.checked ? (el("ifarchWTG").src = b, el("TitleFileClim").innerHTML = "<strong>(" + currentFile + ".WTG)</strong>", processData(c.responseText)) : el("ifarchCLX").src =
        b) : k.innerHTML = "Sorry, your browser does not support XMLHTTPRequest objects. This page requires Internet Explorer 5 or better for Windows, or Firefox for any system, or Safari. Other compatible browsers may also exist." : alert("Bad id " + a + "passed to clientSideInclude.You need a div or span element with this id in your page.")
}

function display_column(a, b) {
}

function processData(a) {
    el("info").innerHTML = "<img src='images/loading.gif'/> <h2>Loading...</h2>";
    arrayDATE = [];
    arraySRAD = [];
    arrayTMAX = [];
    arrayTMIN = [];
    arrayRAIN = [];
    var b = a.split("\n");
    for (a = 4; a < b.length; a++) {
        var c = removeNulls(b[a].split(" "));
        if (4 <= c.length) {
            var d = c[0].trim();
            arrayDATE.push(d);
            d = c[1].trim();
            arraySRAD.push(parseFloat(d));
            d = c[2].trim();
            arrayTMAX.push(parseFloat(d));
            d = c[3].trim();
            arrayTMIN.push(parseFloat(d));
            c = c[4].trim();
            arrayRAIN.push(parseFloat(c))
        }
    }
    createChartRAIN();
    createChartSRAD();
    createChartTEMP()
}

function removeNulls(a) {
    var b = [];
    for (i = 0; i < a.length; i++) "" != a[i].trim() && b.push(a[i]);
    return b
}
String.prototype.trim = function () {
    return this.replace(/^\s*/, "").replace(/\s*$/, "")
};
String.prototype.ltrim = function () {
    return this.replace(/^\s+/, "")
};
String.prototype.rtrim = function () {
    return this.replace(/\s+$/, "")
};
String.prototype.fulltrim = function () {
    return this.replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g, "").replace(/\s+/g, " ")
};
String.prototype.capitalize = function () {
    return this.charAt(0).toUpperCase() + this.slice(1)
};
Array.prototype.max = function () {
    for (var a = this[0], b = this.length, c = 1; c < b; c++) this[c] > a && (a = this[c]);
    return a
};
Array.prototype.min = function () {
    for (var a = this[0], b = this.length, c = 1; c < b; c++) this[c] < a && (a = this[c]);
    return a
};
$(document).ready(function () {
    $(".rss-popup a").hover(function () {
        $(this).next("em").stop(!0, !0).animate({
            opacity: "show",
            top: "60"
        }, "slow")
    }, function () {
        $(this).next("em").animate({
            opacity: "hide",
            top: "60"
        }, "fast")
    })
});
$(function () {
    $("#BtnRun").button();
    $("#BtnRunClimateDiagram").button();
    $("#BtnSoil").button();
    $("#radioCharts").buttonset();
    $("#radioClimateCharts").buttonset()
});
var simpleEncoding = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function simpleEncode(a, b) {
    for (var c = ["s:"], d = 0; d < a.length; d++) {
        var e = a[d];
        !isNaN(e) && 0 <= e ? c.push(simpleEncoding.charAt(Math.round((simpleEncoding.length - 1) * e / b))) : c.push("_")
    }
    return c.join("")
}
var EXTENDED_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-.",
    EXTENDED_MAP_LENGTH = EXTENDED_MAP.length;

function extendedEncode(a, b) {
    var c = "e:";
    i = 0;
    for (len = a.length; i < len; i++) {
        var d = new Number(a[i]),
            e = Math.floor(EXTENDED_MAP_LENGTH * EXTENDED_MAP_LENGTH * d / b);
        e > EXTENDED_MAP_LENGTH * EXTENDED_MAP_LENGTH - 1 ? c += ".." : 0 > e ? c += "__" : (d = Math.floor(e / EXTENDED_MAP_LENGTH), e -= EXTENDED_MAP_LENGTH * d, c += EXTENDED_MAP.charAt(d) + EXTENDED_MAP.charAt(e))
    }
    return c
}

function getFormattedName(a) {
    a = a.replace(/[\/\\<>"'&*:?|()]/g, "-");
    a = a.trim();
    a = a.replace(/ /gi, "_");
    25 <= a.length && (a = a.substring(0, 25));
    return a
}

function getFileDirectory(a) {
    return -1 == a.indexOf("/") ? a.substring(0, a.lastIndexOf("\\")) : a.substring(0, a.lastIndexOf("/"))
}
//****************Calling MarkSIM functions from ArcGIS Rest Service
function computeMarkSimGCMService(a, b, c, d, e, g, k, h, f) {
    var l = "";
    h = getFormattedName(h);
    8 > h.length && (l = h + "________");
    l = l.substring(0, 8);
    Place = h;
    NumRep = g;
    gp.submitJob({
        WorldClim_30_arc_sec_file: "",
        Path_for_MarSim_data: "",
        Path_for_GCM_data: "",
        Place_Name: h,
        CLXname: l,
        Template: c,
        RCP_Code: d,
        Year_of_Simulation: e,
        Seed: k,
        Number_of_Replications: g,
        Site_Latitude: a,
        Site_Longitude: b,
        CLX_out: f
    }, completeCallback, statusCallback)
}

function statusCallback(a) {
    "esriJobFailed" == a.jobStatus && (console.log("Processing Job Failed. Please try again..."), alert("Processing Job Failed. Please try again..."))
}

function completeCallback(a) {
    gp.getResultData(a.jobId, "Return_Code", function (b) {
        var c = b.value.toString();
        "0->Process finished successfully" != b.value.toString() ? (alert(c), el("runClimateDiagram").style.display = "block", el("soildata").style.display = "block", el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">') : gp.getResultData(a.jobId, "Summary", displayResult)
    })
}

function displayResult(a, b) {
    var c = a.value.url,
        d = document.forms.input_form.clxout.checked;
    if (c && !0 == d) {
        "e:arcgisserver" == c.substring(0, 16) && (c = c.replace("e:arcgisserver", "http://gisweb.ciat.cgiar.org"));
        d = getFileDirectory(c);
        c = getFormattedName(Place);
        8 > c.length && (c += "________");
        c = getFormattedName(c).substring(0, 8);
        OutDir = d + "/" + Place;
        var e = d + "/" + Place + ".zip";
        clxfile = d + "/" + Place + "/" + c + ".txt";
        clientSideInclude("ifarchWTG", clxfile);
        el("td_SoilResult").style.display = "none";
        el('SoilResults').innerHTML = "";
        el("td_CLXResults").style.display = "";
        el("shResults").style.display = "";
        d = '<a href="' + e + '" target="_new" class="btnDownloadPDF ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">Download CLX file</a><a href="JavaScript:closeCLXView();void(0);" class="btnViewLarger ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">Close</a>';
        el("CLXResults").innerHTML = d;
        el("runClimateDiagram").style.display = "block";
        el("soildata").style.display = "block";
        el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">';
        $("html, body").stop().animate({
            scrollTop: $("#CLXResults").offset().top
        }, 1E3)
    } else c && !1 == d && ("e:arcgisserver" == c.substring(0, 16) && (c = c.replace("e:arcgisserver", "http://gisweb.ciat.cgiar.org")), d = getFileDirectory(c), OutDir = d + "/" + Place, e = d + "/" + Place + ".zip", el("btnDownload").innerHTML = "<h3>Data with (" + NumRep + ") replications in a zip file. Click on the icon to start download</h3><a href='" + e + "'><img src='images/zip-icon.jpg' style='width:80;border:0;margin:0;'></a>", el("td_SoilResult").style.display = "none",
        el('SoilResults').innerHTML = "", el("td_results").style.display = "",
        el("shResults").style.display = "", currentFile = "CLIM0101", showClimateFileData("CLIM0101"), el("runClimateDiagram").style.display = "block", el("soildata").style.display = "block", el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">', $("html, body").stop().animate({
        scrollTop: $("#ClimateResults").offset().top
    }, 1E3)), c || (console.log("Require URL to jsonStore Failed"), el("runClimateDiagram").style.display =
        "block", el("soildata").style.display = "block", el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">')
}
//****************End Calling MarkSIM functions


//****************Calling Climate Diagram MarkSIM functions from ArcGIS Rest Service
function showClimateDiagram(a) {
    el("infoClimateDiagram").innerHTML = "<img src='images/loading.gif'/> <h2>Loading...</h2>";
    switch (a) {
        case "NORMAL":
            el("infoClimateDiagram").innerHTML = imgNORMAL;
            break;
        case "POLAR":
            el("infoClimateDiagram").innerHTML = imgPOLAR;
            break;
        case "ALL":
            el("infoClimateDiagram").innerHTML = imgCLIMATEDIAGRAMS;
            break;
        default:
            el("infoClimateDiagram").innerHTML = "<img src='images/loading.gif'/> <h2>Loading...</h2>"
    }
}

function RunClimateDiagram(a, b, c, d, e) {
    gp2.submitJob({
        WorldClim_30_arc_sec_file: "",
        Path_for_MarSim_data: "",
        Path_for_GCM_data: "",
        Template: c,
        RCP_Code: d,
        Year_of_Simulation: e,
        Site_Latitude: a,
        Site_Longitude: b
    }, completeDiagramCallback, statusDiagramCallback)
}

function statusDiagramCallback(a) {
    "esriJobFailed" == a.jobStatus && alert("Processing Climate Diagram Failed. Please try again...")
}

function completeDiagramCallback(a) {
    gp2.getResultData(a.jobId, "Return_Code", function (b) {
        b = b.value.toString();
        "Process finished successfully" != b.split(">")[1] ? alert(b) : (gp2.getResultData(a.jobId, "Climate_Diagram_Data", function (a) {
        }), gp2.getResultData(a.jobId, "All_Charts_in_PDF", function (a) {
            if (a = a.value.url) {
                var b = getFileDirectory(a);
                console.log("URLDIR" + b);
                a = b + "/hist.png";
                var e = b + "/histRot.png",
                    g = b + "/windrose.png",
                    k = b + "/windroseRot.png",
                    h = b + "/ClimateCharts.png";
                imgNORMAL = '<img src="' + a + '" width="340px">';
                imgNORMAL += '<div style="width:100%">';
                imgNORMAL += '<span style="margin-right:140px;margin-left:35px;"><a href="' + a + '" target="_new" class="btnDownloadPDF ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">View Larger</a></span>';
                imgNORMAL += "</div>";
                imgPOLAR = '<img src="' + g + '" width="340px">';
                imgPOLAR += '<div style="width:100%">';
                imgPOLAR += '<span style="padding-right:140px;margin-left:0px;"><a href="' + g + '" target="_new" class="btnDownloadPDF ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">View Larger</a></span>';
                imgPOLAR += "</div>";
                imgCLIMATEDIAGRAMS = '<img src="' + h + '" width="600px" height="600px"><br/>';
                imgCLIMATEDIAGRAMS += '<a href="' + h + '" target="_new" class="btnViewLarger ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">View Larger</a>';
                imgCLIMATEDIAGRAMS += '<a href="' + (b + "/ClimateCharts.pdf") + '" target="_new" class="btnDownloadPDF ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">Download in PDF</a>';
                cantClimateCharts += 1;
                var b =
                        '<div id="popupClimateDiagramWin"><div id="optCharts">' + ('<input type="checkbox" id="chbx_polar_' + cantClimateCharts + '" title="Polar" onclick="showDiagram(' + cantClimateCharts + ')">Polar'),
                    b = b + ('<input type="checkbox" id="chbx_rotated_' + cantClimateCharts + '" title="Rotated" onclick="showDiagram(' + cantClimateCharts + ')">Rotated'),
                    b = b + "</div>",
                    b = b + ('<div id="hist_' + cantClimateCharts + '">'),
                    b = b + ('<img src="' + a + '" style="width:340px;margin-top:15px;">'),
                    b = b + '<div style="width:100%;text-align:center;">',
                    b = b +
                        ('<span><a href="' + a + '" target="_new" class="btnViewLarger2 ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">View Larger</a></span>'),
                    b = b + "</div>",
                    b = b + "</div>",
                    b = b + ('<div id="histRot_' + cantClimateCharts + '" style="display:none;">'),
                    b = b + ('<img src="' + e + '" style="width:340px;margin-top:15px;">'),
                    b = b + '<div style="width:100%;text-align:center;">',
                    b = b + ('<span><a href="' + e + '" target="_new" class="btnViewLarger2 ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">View Larger</a></span>'),
                    b = b + "</div>",
                    b = b + "</div>",
                    b = b + ('<div id="polar_' + cantClimateCharts + '" style="display:none;">'),
                    b = b + ('<img src="' + g + '" style="width:340px;margin-top:15px;">'),
                    b = b + '<div style="width:100%;text-align:center;">',
                    b = b + ('<span><a href="' + g + '" target="_new" class="btnViewLarger2 ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">View Larger</a></span>'),
                    b = b + "</div>",
                    b = b + "</div>",
                    b = b + ('<div id="polarRot_' + cantClimateCharts + '" style="display:none;">'),
                    b = b + ('<img src="' +
                        k + '" style="width:340px;margin-top:15px;">'),
                    b = b + '<div style="width:100%;text-align:center;">',
                    b = b + ('<span><a href="' + k + '" target="_new" class="btnViewLarger2 ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">View Larger</a></span>'),
                    b = b + "</div>",
                    b = b + "</div>",
                    b = b + "</div>",
                    f = document.createElement("div");
                f.id = "CD_" + cantClimateCharts;
                f.innerHTML = b;
                a = Place.substring(0, 15) + "...";
                $(f).dialog({
                    width: 390,
                    height: 450,
                    title: a,
                    bgiframe: !0,
                    minimize: !0,
                    resizable: !1,
                    show: {
                        effect: "blind",
                        duration: 800
                    },
                    close: function (a, b) {
                        f.innerHTML = "";
                        $(this).dialog("destroy")
                    },
                    open: function (a, b) {
                    }
                });
                Diagrams.push([imgNORMAL, imgPOLAR, imgCLIMATEDIAGRAMS]);
                addClimateDiag(Diagrams.length - 1, Place);
                showClimateDiagram("NORMAL")
            }
        }));
        el("runClimateDiagram").style.display = "block";
        el("soildata").style.display = "block"
        el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false">'
    })
}

function showDiagram(a) {
    if (a && !(0 > a || isNaN(a))) {
        var b = el("chbx_polar_" + a).checked;
        el("chbx_rotated_" + a).checked ? b ? (el("polarRot_" + a).style.display = "", el("polar_" + a).style.display = "none", el("hist_" + a).style.display = "none", el("histRot_" + a).style.display = "none") : (el("histRot_" + a).style.display = "", el("polarRot_" + a).style.display = "none", el("polar_" + a).style.display = "none", el("hist_" + a).style.display = "none") : (b ? (el("polar_" + a).style.display = "", el("hist_" + a).style.display = "none") : (el("hist_" + a).style.display =
            "", el("polar_" + a).style.display = "none"), el("polarRot_" + a).style.display = "none", el("histRot_" + a).style.display = "none")
    }
}

function updateHistogram(a) {
    imgNORMAL = Diagrams[a][0];
    showClimateDiagram("NORMAL")
}

function updatePolarChart(a) {
    imgPOLAR = Diagrams[a][1];
    showClimateDiagram("POLAR")
}

function updateAllChart(a) {
    imgCLIMATEDIAGRAMS = Diagrams[a][2];
    showClimateDiagram("ALL")
}

function updateClimateDiagram(a) {
    for (var b = 0, c = 0; c < document.climateDiagram.radioClimateDiagram.length; c++) document.climateDiagram.radioClimateDiagram[c].checked && (b = c);
    switch (b) {
        case 0:
            updateHistogram(a);
            break;
        case 1:
            updatePolarChart(a);
            break;
        case 2:
            updateAllChart(a);
            break;
        default:
            console.log("File not found!!!")
    }
}

function addClimateDiag(a, b) {
    var c = document.createElement("a"),
        d = document.createTextNode(b.toUpperCase());
    c.appendChild(d);
    c.title = b.toUpperCase();
    c.href = "javascript:updateClimateDiagram(" + a + ");";
    el("linktoClimateDiag").appendChild(c);
    c = document.createElement("br");
    el("linktoClimateDiag").appendChild(c)
}
//****************Calling Climate Diagram MarkSIM functions
function closeCLXView() {
    el("td_CLXResults").style.display = "none";
    clxfile = null
}

function minimizePopupWin(a) {
    $(a).parents(".ui-dialog").animate({
        height: "30px",
        top: $(window).height() - 40
    }, 200)
}

function maximizePopupWin(a) {
    $(a).parents(".ui-dialog").animate({
        top: ($(window).height() - 450) / 2,
        height: 450
    }, 200)
}

function showHidePresentDayClimateParams(a) {
    a ? (el("tr_scenario").style.display = "", el("tr_rcp").style.display = "", el("tr_year").style.display = "", el("tr_txtPresentDay").style.display = "none") : (el("tr_scenario").style.display = "none", el("tr_rcp").style.display = "none", el("tr_year").style.display = "none", el("tr_txtPresentDay").style.display = "")
}

function onChangeModelSelection() {
    tpl = getTemplateofGCMs();
    "00000000000000000" != tpl ? showHidePresentDayClimateParams(!0) : showHidePresentDayClimateParams(!1)
};

//****************Calling MarkSIM Soils functions from ArcGIS Rest Service
function computeSoilsService(a, b) {
    var l = "";
    gp3.submitJob({
        lat: a,
        long: b
    }, completeCallbackSoil, statusCallbackSoil)
}

function statusCallbackSoil(a) {
    //console.log("return status", a);
    "esriJobFailed" == a.jobStatus && (console.log("Processing Soils Job Failed. Please try again..."), alert("Processing Soils Job Failed. Please try again..."));
}

function completeCallbackSoil(a) {
    //console.log("return status", a);
    gp3.getResultData(a.jobId, "ReturnCode",
        function (b) {
            var c = b.value.toString()
            if (b.value.toString() != "\"0 -> Process finished successfully\"") {
                el("runClimateDiagram").style.display = "block"
                el("soildata").style.display = "block"
                el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" \n\
        class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false" />'
            }
            else {
                gp3.getResultData(a.jobId, "ReturnCode", displaySoilResult(a))

            }
        })
}

function displaySoilResult(a) {
    el('SoilResults').innerHTML = "";
    el("td_CLXResults").style.display = "none";
    el("td_results").style.display = "none";
    el("shResults").style.display = "none";
    el("runClimateDiagram").style.display = "none";
    el("soildata").style.display = "block";
    el("runClimateDiagram").style.display = "block";
    el("runmodel").innerHTML = '<input type="button" id="BtnRun" value="Run Model" onclick="javascript:RunModel();" class="ui-button ui-widget ui-state-default ui-corner-all" role="button" aria-disabled="false" />';
    el("td_SoilResult").style.display = "";
    el('SoilResults').innerHTML = "<h3>Soil File</h3><p style='text-align:justify; padding-left: 15%; padding-right:15%;'>Here we use the Harmonized World Soil Database (HWSD), the most up-to-date world soil map \n\
    (FAO, 2012). It incorporates a data table of 48,148 soil profile descriptions related to the various soils associated with each mapping unit, at a spatial resolution of 30 \n\
    arc-seconds (approximately 1 km at the  equator).</br></br>\n\
    For each point sampled there are not necessarily profile data available. Thus the most representative profile was selected from the 48,148 for each soil type retrieved from  \n\
    the map, see <a href='docs/JonesSoilsGcmAgSys2015.pdf' target='_new'>Jones & Thornton (2015)</a>.</p>  \n\
    <a target='_blank' href='http://gisweb.ciat.cgiar.org/arcgis/rest/directories/arcgisjobs/soils_gpserver/" + a.jobId + "/scratch/soilzip.zip'>  \n\
        <img src='images/ZIPx64.png' style='width: 80px; margin-top: 0px; margin-right: 0px; margin-bottom: 0px; margin-left: 0px; border-top-width: 0px; border-right-width: 0px; border-bottom-width: 0px; border-left-width: 0px; border-top-style: none; border-right-style: none; border-bottom-style: none; border-left-style: none;'>\n\
    </a>";
    $("html, body").stop().animate({
        scrollTop: $("#CLXResults").offset().top
    }, 1E3)
}
function create_soilzip(soil, soilproportions) {
    var zip = new JSZip();
    zip.add("soil.sol", soil.toString());
    zip.add("soil.proportions.txt", soilproportions.toString());
    content = zip.generate();
    location.href = "data:application/zip;base64," + content;
}
function datasoil(url) {
    var newurl = "http://gisweb.ciat.cgiar.org/arcgis/rest/directories/arcgisjobs/soils_gpserver/" + url + "/scratch/";
    var soilurl = newurl + "soil.sol"
    var proportionurl = newurl + "soil.proportions.txt"
    var soil, soilproportions;
    jQuery.get(soilurl, function (data) {
        var soil = data;
        //console.log("soil --->" +soil);
        jQuery.get(proportionurl,
            function (data) {
                soilproportions = data;
                //console.log("soilproportion ----> " + soilproportions);
                create_soilzip(soil, soilproportions)
            });

    });
}

//****************End Calling MarkSIM functions
