// utils/runValidations.js
function runValidations(res, ...checks) {
    // each check is an error string or null — return the first failure
    const failure = checks.find(c => c !== null);
    if (failure) {
        res.status(400).json({ success: false, message: failure });
        return true;   // caller should `return` immediately after this
    }
    return false;
}
module.exports = { runValidations };