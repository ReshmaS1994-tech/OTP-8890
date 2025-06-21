/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */ /**********************************************************************************************
* Client Name
*
*
*
${OTP-8890}:{External Custom Record form and actions}
*
*
**************************************************************************************************
*
*Author:Jobin and Jismi IT Services
*
*Date Created:15-jUNE-2025
*
*Description:This Suitelet script  will automate external customer record entries in NetSuite. It will link records to existing
customers based on email, check for duplicates before saving, and send notifications to a static NetSuite Admin. If a Sales Rep
is assigned, they will also receive an email alert, ensuring efficient communication and record management.  
*
*REVISION HISTORY
*@version 1.0 15-June-2025 :Created the initial build by JJ0402
*/
define([
  "N/ui/serverWidget",
  "N/log",
  "N/record",
  "N/search",
  "N/email",
], (serverWidget, log, record, search, email) => {
  /**
   * Defines the Suitelet script trigger point.
   * @param {Object} scriptContext
   * @param {ServerRequest} scriptContext.request - Incoming request
   * @param {ServerResponse} scriptContext.response - Suitelet response
   * @since 2015.2
   */

  const onRequest = (scriptContext) => {
    try {
      if (scriptContext.request.method === "GET") {
        renderForm(scriptContext);
      } else if (scriptContext.request.method === "POST") {
        handleFormSubmission(scriptContext);
      }
    } catch (error) {
      log.error("Error Creating Custom Record", error.message);
      scriptContext.response.write(
        JSON.stringify({ error: `An error occurred: ${error.message}` })
      );
    }
  };

/**
 * Renders a custom form with fields for customer input and displays it on the page.
 *
 * This function creates a Suitelet form titled "Custom Record Submission" with the following input fields:
 * - Customer Name (text)
 * - Customer Email (email)
 * - Subject (text)
 * - Message (textarea)
 * It also includes a Submit button to allow form submission.
 *
 * @param {Object} scriptContext - The context object provided by the Suitelet entry point.
 * @param {Object} scriptContext.response - The response object used to write the form to the page.
 */

  function renderForm(scriptContext) {
    const form = serverWidget.createForm({
      title: "Custom Record Submission",
    });

    form.addField({
      id: "custpage_customer_name",
      type: serverWidget.FieldType.TEXT,
      label: "Customer Name",
    });
    form.addField({
      id: "custpage_customer_email",
      type: serverWidget.FieldType.EMAIL,
      label: "Customer Email",
    });
    form.addField({
      id: "custpage_subject",
      type: serverWidget.FieldType.TEXT,
      label: "Subject",
    });
    form.addField({
      id: "custpage_message",
      type: serverWidget.FieldType.TEXTAREA,
      label: "Message",
    });

    form.addSubmitButton({ label: "Submit" });
    scriptContext.response.writePage(form);
  }

/**
 * Handles the submission of a custom customer form in a Suitelet.
 *
 * This function performs the following steps:
 * - Extracts the request body from the script context.
 * - Validates that all required fields are present.
 * - Checks for duplicate entries based on the customer's email.
 * - Retrieves the internal customer ID if the email exists in the system.
 * - Creates a new custom record tied to the customer.
 * - Builds a list of recipients and sends out notification emails.
 * - Writes a JSON response indicating success and the created record ID.
 *
 * @param {Object} scriptContext - The Suitelet script context object.
 * @param {Object} scriptContext.request - The HTTP request object.
 * @param {Object} scriptContext.response - The HTTP response object used to send output back to the client.
 */
  function handleFormSubmission(scriptContext) {
    const requestBody = extractRequestBody(scriptContext);
    if (isMissingFields(requestBody)) {
      return writeError(scriptContext, "Missing required fields.");
    }

    if (isDuplicate(requestBody.customerEmail)) {
      log.audit(
        "Duplicate Entry Attempt",
        `Email: ${requestBody.customerEmail}, Subject: ${requestBody.subject}`
      );
      return writeError(
        scriptContext,
        "Duplicate record found. Entry already exists."
      );
    }

    const customerId = getCustomerIdByEmail(requestBody.customerEmail);
    const recordId = createCustomCustomerRecord(requestBody, customerId);
    const recipients = buildRecipientList(customerId, requestBody);

    sendEmailNotifications(recipients, requestBody);
    scriptContext.response.write(JSON.stringify({ success: true, recordId }));
  }
/**
 * Extracts form input parameters from the Suitelet request object.
 *
 * This function retrieves user-submitted values from the Suitelet's request parameters,
 * including customer name, email, subject, and message, and returns them in a structured object.
 *
 * @param {Object} scriptContext - The Suitelet script context containing the request data.
 * @param {Object} scriptContext.request - The HTTP request object with form parameter values.
 * @returns {Object} An object containing the extracted form fields:
 *  - {string} customerName - The name entered by the customer.
 *  - {string} customerEmail - The customer's email address.
 *  - {string} subject - The subject of the message.
 *  - {string} message - The content of the customer's message.
 */

  function extractRequestBody(scriptContext) {
    return {
      customerName: scriptContext.request.parameters.custpage_customer_name,
      customerEmail: scriptContext.request.parameters.custpage_customer_email,
      subject: scriptContext.request.parameters.custpage_subject,
      message: scriptContext.request.parameters.custpage_message,
    };
  }

  /**
 * Checks whether any required fields in the submitted data are missing.
 *
 * This function evaluates the presence of all mandatory form fields:
 * customerEmail, customerName, subject, and message. If any field is
 * missing or empty, the function returns true to indicate validation failure.
 *
 * @param {Object} data - The object containing form submission values.
 * @param {string} data.customerEmail - The email address provided by the customer.
 * @param {string} data.customerName - The customer's name.
 * @param {string} data.subject - The subject of the form submission.
 * @param {string} data.message - The content of the message submitted by the customer.
 * @returns {boolean} Returns true if any required field is missing; otherwise, false.
 */
  function isMissingFields(data) {
    return !(
      data.customerEmail &&
      data.customerName &&
      data.subject &&
      data.message
    );
  }

  /**
 * Checks if a customer record with the given email address already exists.
 *
 * This function performs a search on the "customrecord_jj_custom_record_customer" custom record
 * type to determine if any records match the provided customer email. If at least one record
 * is found, it is considered a duplicate.
 *
 * @param {string} email - The customer email address to check for duplicates.
 * @returns {boolean} Returns true if a matching record is found; otherwise, false.
 */
  function isDuplicate(email) {
    const duplicateSearch = search.create({
      type: "customrecord_jj_custom_record_customer",
      filters: [["custrecord_jj_cus_email", "is", email]],
      columns: ["internalid"],
    });

    const result = duplicateSearch.run().getRange({ start: 0, end: 1 });
    return result.length > 0;
  }
 
 
 /**
 * Retrieves the internal ID of an active customer based on their email address.
 *
 * This function searches the Customer record type using the provided email.
 * It includes an additional filter to exclude inactive customers.
 * If a matching active customer is found, their internal ID is returned; otherwise, null is returned.
 *
 * @param {string} email - The email address to search for in active customer records.
 * @returns {string|null} The internal ID of the customer if found and active, or null if no match is found.
 */

  function getCustomerIdByEmail(email) {
    const customerSearch = search.create({
      type: "customer",
      filters: [["email", "is", email],'AND',['isinactive','is','F']],
      columns: ["internalid"],
    });

    const result = customerSearch.run().getRange({ start: 0, end: 1 });
    return result.length > 0 ? result[0].id : null;
  }
/**
 * Creates a new custom customer record in NetSuite using the provided data.
 *
 * This function initializes a dynamic custom record of type "customrecord_jj_custom_record_customer"
 * and populates it with the customer's name, email, subject, and message from the submitted form data.
 * If a valid NetSuite customer ID is provided, it is also stored as a reference field in the record.
 * After saving, the internal ID of the new record is returned.
 *
 * @param {Object} data - The data submitted from the form.
 * @param {string} data.customerName - The name of the customer.
 * @param {string} data.customerEmail - The customer's email address.
 * @param {string} data.subject - The subject of the message.
 * @param {string} data.message - The message content.
 * @param {string|null} customerId - The internal ID of the existing NetSuite customer, if available.
 * @returns {number} The internal ID of the newly created custom record.
 */  

  function createCustomCustomerRecord(data, customerId) {
    const customRecord = record.create({
      type: "customrecord_jj_custom_record_customer",
      isDynamic: true,
    });

    customRecord.setValue({
      fieldId: "custrecord_jj_cus_name",
      value: data.customerName,
    });
    customRecord.setValue({
      fieldId: "custrecord_jj_cus_email",
      value: data.customerEmail,
    });
    customRecord.setValue({
      fieldId: "custrecord_jj_cus_subject",
      value: data.subject,
    });
    customRecord.setValue({
      fieldId: "custrecord_jj_cus_message",
      value: data.message,
    });

    if (customerId) {
      customRecord.setValue({
        fieldId: "custrecord_jj_cus_reference",
        value: customerId,
      });
    }

    const recordId = customRecord.save();
    log.audit("Custom Record Created", `Record ID: ${recordId}`);
    return recordId;
  }

  /**
 * Builds a list of recipients to be notified based on the customer ID and request data.
 *
 * By default, the recipient list includes a static fallback recipient (e.g. "Deity Daemon").
 * If a valid customer ID is provided, the function looks up the associated sales representative.
 * If the sales rep has an active status and an email address, they are added to the recipient list.
 *
 * @param {string|null} customerId - The internal ID of the customer, if available.
 * @param {Object} requestBody - The full set of data submitted in the form (not directly used in this function).
 * @returns {Array<Object>} A list of recipient objects with the following structure:
 *   - {number} id - The internal ID of the recipient (e.g. employee ID).
 *   - {string} name - The display name of the recipient.
 */

  function buildRecipientList(customerId, requestBody) {
    const recipients = [{ id: -5, name: "Deity Daemon" }];

    if (!customerId) return recipients;

    const customerLookup = search.lookupFields({
      type: "customer",
      id: customerId,
      columns: [
        "salesrep.email",
        "salesrep.entityid",
        "salesrep.internalid",
        "salesrep.isinactive",
      ],
    });

    if (
      customerLookup["salesrep.email"] &&
      customerLookup["salesrep.isinactive"] !== true
    ) {
      recipients.push({
        id: customerLookup["salesrep.internalid"][0].value,
        name: customerLookup["salesrep.entityid"] || "Sales Rep",
      });
    }

    return recipients;
  }

  /**
 * Sends email notifications to a list of recipients regarding a new customer entry.
 *
 * Iterates through the provided recipients array and dispatches an email to each,
 * using a system-level author. The email includes a personalized greeting, the
 * subject line from the request body, and the message content provided by the user.
 *
 * @param {Array<Object>} recipients - An array of recipient objects, each containing:
 *   - {number} id - The internal ID of the recipient (e.g. employee ID).
 *   - {string} name - The recipient's name used in the email greeting.
 * @param {Object} requestBody - The form submission data.
 * @param {string} requestBody.subject - The subject line of the email.
 * @param {string} requestBody.message - The body content of the email message.
 */

  function sendEmailNotifications(recipients, requestBody) {
    const adminName = "Deity Daemon";

    recipients.forEach((recipient) => {
      email.send({
        author: -5,
        recipients: recipient.id,
        subject: requestBody.subject,
        body: `Dear ${recipient.name},\n\nA new entry has been created.\n\nMessage: ${requestBody.message}\n\nBest regards,\n${adminName}`,
      });
    });
  }
 
 /**
 * Sends a JSON-formatted error response to the client.
 *
 * This function writes a response containing an error message string,
 * allowing Suitelets to return user-friendly errors in a consistent structure.
 *
 * @param {Object} scriptContext - The Suitelet script context object.
 * @param {Object} scriptContext.response - The response object used to output the JSON.
 * @param {string} message - The error message to be included in the response.
 */
  function writeError(scriptContext, message) {
    scriptContext.response.write(JSON.stringify({ error: message }));
  }
  return { onRequest };
});
