const sendErrorResponse = (resp, status, errorMessage) => {
    resp.status(status).json({
        success: false,
        message: errorMessage,
    });
};


const sendSuccessResponse = (resp, status, successMessage, data={}) => {
    resp.status(status).json({
        success: true,
        message: successMessage,
        data: data
    });
};

module.exports = {
    sendErrorResponse,
    sendSuccessResponse
}
