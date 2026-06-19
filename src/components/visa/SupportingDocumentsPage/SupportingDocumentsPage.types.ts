export interface SupportingDocPayload {
  applicationId:              string
  seamansBookUploaded:        boolean
  seamansBookFile?:           File
  supportingLetterRequested:  boolean
  supportingLetterAuthorised: boolean
  alternativeDocsDeclared:    boolean
  documentsConfirmed:         boolean
}
