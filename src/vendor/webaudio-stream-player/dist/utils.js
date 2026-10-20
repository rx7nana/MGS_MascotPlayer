export const isSafari = (() => {
    const maybeSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (maybeSafari) {
        if (/google/i.test(navigator.vendor)) {
            // A fake Safari that may be a mobile simulator on Chrome.
            return false;
        }
        return true;
    }
    return false;
})();
export const isChrome = (() => {
    var _a;
    const uad = navigator.userAgentData;
    if (uad && ((_a = uad === null || uad === void 0 ? void 0 : uad.brands[0]) === null || _a === void 0 ? void 0 : _a.brand) == "Google Chrome") {
        return true;
    }
    return false;
})();
