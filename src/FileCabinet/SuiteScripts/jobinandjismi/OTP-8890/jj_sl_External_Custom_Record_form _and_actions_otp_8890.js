/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *//**********************************************************************************************
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
*Description:This Suiteletscript will This Document summarizes a Suitelet script that will automate external customer record entries in NetSuite. It will link records to existing customers based on email, check for duplicates before saving, and send notifications to a static NetSuite Admin. If a Sales Rep is assigned, they will also receive an email alert, ensuring efficient communication and record management.  
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
  "N/runtime",
], (serverWidget, log, record, search, email, runtime) => {
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
        log.debug("hai");

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
      } else if (scriptContext.request.method === "POST") {
        const requestBody = {
          customerName: scriptContext.request.parameters.custpage_customer_name,
          customerEmail:
            scriptContext.request.parameters.custpage_customer_email,
          subject: scriptContext.request.parameters.custpage_subject,
          message: scriptContext.request.parameters.custpage_message,
        };

        if (
          !requestBody.customerEmail ||
          !requestBody.customerName ||
          !requestBody.subject ||
          !requestBody.message
        ) {
          scriptContext.response.write(
            JSON.stringify({ error: "Missing required fields." })
          );
          return;
        }

        let customerId = null;

        const duplicateSearch = search.create({
          type: "customrecord_jj_custom_record_customer",
          filters: [
            ["custrecord_jj_cus_email", "is", requestBody.customerEmail],
            "AND",
            ["custrecord_jj_cus_subject", "is", requestBody.subject],
          ],
          columns: ["internalid"],
        });

        const duplicateResult = duplicateSearch
          .run()
          .getRange({ start: 0, end: 1 });
        if (duplicateResult.length > 0) {
          log.audit(
            "Duplicate Entry Attempt",
            `Email: ${requestBody.customerEmail}, Subject: ${requestBody.subject}`
          );
          scriptContext.response.write(
            JSON.stringify({
              error: "Duplicate record found. Entry already exists.",
            })
          );
          return;
        }

        const customerSearch = search.create({
          type: "customer",
          filters: [["email", "is", requestBody.customerEmail]],
          columns: ["internalid"],
        });

        const customerResult = customerSearch
          .run()
          .getRange({ start: 0, end: 1 });
        if (customerResult.length > 0) {
          customerId = customerResult[0].id;
        }

        const customRecord = record.create({
          type: "customrecord_jj_custom_record_customer",
          isDynamic: true,
        });
        customRecord.setValue({
          fieldId: "custrecord_jj_cus_name",
          value: requestBody.customerName,
        });
        customRecord.setValue({
          fieldId: "custrecord_jj_cus_email",
          value: requestBody.customerEmail,
        });
        customRecord.setValue({
          fieldId: "custrecord_jj_cus_subject",
          value: requestBody.subject,
        });
        customRecord.setValue({
          fieldId: "custrecord_jj_cus_message",
          value: requestBody.message,
        });

        if (customerId) {
          customRecord.setValue({
            fieldId: "custrecord_jj_cus_reference",
            value: customerId,
          });
        }

        const recordId = customRecord.save();
        log.audit("Custom Record Created", `Record ID: ${recordId}`);

        const adminId = -5;
        const adminName = "Deity Daemon";
        const recipientEmails = [{ id: adminId, name: adminName }];

        if (customerId) {
          const customerLookup = search.lookupFields({
            type: "customer",
            id: customerId,
            columns: [
              "salesrep.email",
              "salesrep.entityid",
              "salesrep.internalid",
            ],
          });

          log.debug("Sales Rep Info:", customerLookup);

          if (customerLookup["salesrep.email"]) {
            recipientEmails.push({
              id: customerLookup["salesrep.internalid"][0].value,
              name: customerLookup["salesrep.entityid"] || "Sales Rep",
            });
          }
        }

        sendEmail(recipientEmails);
        /**
         * Sends an email notification to a list of recipients.
         *
         * @param {Array} recipientEmails - An array of recipient objects containing email details.
         * @param {Object} recipientEmails[].id - The recipient's email ID.
         * @param {Object} recipientEmails[].name - The recipient's name.
         * @param {Object} requestBody - The request body containing the subject and message.
         * @param {string} requestBody.subject - The subject of the email.
         * @param {string} requestBody.message - The message body of the email.
         * @param {string} adminName - The name of the administrator sending the email.
         */

        function sendEmail(recipientEmails) {
          recipientEmails.forEach((recipient) => {
            email.send({
              author: -5,
              recipients: recipient.id,
              subject: `${requestBody.subject}`,
              body: `Dear ${recipient.name},\n\nA new entry has been created.\n\nMessage: ${requestBody.message}\n\nBest regards,\n${adminName}`,
            });
          });
        }

        scriptContext.response.write(
          JSON.stringify({ success: true, recordId: recordId })
        );
      }
    } catch (error) {
      log.error("Error Creating Custom Record", error.message);
      scriptContext.response.write(
        JSON.stringify({ error: `An error occurred: ${error.message}` })
      );
    }
  };

  return { onRequest };
});
