/**
 * Authors:
 *      Rob Wu <gwnRob@gmail.com>
 *      Peter Wu <lekensteyn@gmail.com>
 *
 * Released under the terms of GPLv3+.
 */

/**
 * URL used for requesting a special download token.
 */
var API_URL = "https://android.clients.google.com/market/api/ApiRequest";

function showLastError() {
    console.log("chrome.extension.lastError", chrome.extension.lastError);
}

/**
 * Use the non-incognito cookie store for in-cognito tabs too.
 */
var storeId = "0";

/**
 * Functions for cookie management.
 */
function setCookie(cookie, callback) {
    cookie.httpOnly = true;
    cookie.storeId = storeId;
    chrome.cookies.set(cookie, function (data) {
        if (data === null) {
            showLastError();
        } else if (typeof callback == "function") {
            callback();
        }
    });
}
function setMDACookie(marketda, callback) {
    setCookie({
        name: "MarketDA",
        value: marketda,
        url: "http://android.clients.google.com/market/",
        domain: "android.clients.google.com", /* set for subdomains too */
        path: "/market/"
    }, callback);
}
function setAPICookie(authToken, callback) {
    setCookie({
        url: API_URL,
        name: "ANDROIDSECURE",
        value: authToken,
    }, callback);
}
function removeAPICookie(callback) {
    chrome.cookies.remove({
        name: "ANDROIDSECURE",
        url: API_URL,
        storeId: storeId
    }, function(data) {
        if (data === null) {
            showLastError();
        } else if (typeof callback == "function") {
            callback();
        }
    });
}

/**
 * Debugging utility: convert a (binary) string to a hexadecimal format.
 */
function strToHex(str) {
    return str.split("").map(function (c) {
        return ("0" + c.charCodeAt(0).toString(16)).substr(-2);
    }).join("");
}

/**
 * Try to retrieve download URL for a given base64-encoded query.
 */
function processAsset(asset_query_base64, packageName) {
    var payload = "version=2&request=" + asset_query_base64;
    var xhr = new XMLHttpRequest();
    xhr.responseType = "arraybuffer";
    xhr.open("POST", API_URL);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.onload = function() {
        removeAPICookie(function() {
            if (xhr.status != 200) {
                alert("ERROR: Cannot download this app!\n" + xhr.status + " " +
                    xhr.statusText);
                return;
            }
            var chars = new Uint8Array(xhr.response);
            /* gzipped content, try to unpack */
            var data = decodeURIComponent((new JXG.Util.Unzip(chars)).unzip()[0][0]);

            var url, marketda;
            if ((url = /https?:\/\/[^:]+/i.exec(data))) {
                url = url[0];
                /* format: "MarketDA", 0x72 ('r'), length of data, data */
                if ((marketda = /MarketDA..(\d+)/.exec(data))) {
                    marketda = marketda[1];
                    var filename = packageName + ".apk";
                    downloadAPK(marketda, url, filename);
                    return;
                }
            }
            console.log("Response: " + data);
            console.log("Response (hex): " + strToHex(data));
            alert("ERROR: Cannot download this app!");
        });
    };
    xhr.onerror = removeAPICookie;
    setAPICookie(localStorage.getItem("authToken"), function () {
        xhr.send(payload);
    });
}

/**
 * Tries to download an APK file given its URL and cookie.
 */
function downloadAPK(marketda, url, filename) {
    if (!filename) filename = "todo-pick-a-name.apk";

    setMDACookie(marketda, function() {
        console.log("Trying to download " + url + " and save it as " + filename);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
    });
}

/**
 * When a tab is loaded, show the APK Downloader icon if on the market page.
 */
chrome.extension.onMessage.addListener(function (message, sender, sendResponse) {
    if (message && message.action == "showIcon") {
        chrome.pageAction.show(sender.tab.id);
    }
});

chrome.pageAction.onClicked.addListener(function (tab) {
    var match = /play\.google\.com\/store\/apps\/details\?id=([\w\d\.\_]+)/i.exec(tab.url);
    if (match) {
        MarketSession.download(match[1], tab.id);
    }
});
