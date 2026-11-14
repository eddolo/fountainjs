# frozen_string_literal: true

# Diagnostic-only initializer mounted in the isolated task deployment. It never
# replaces authentication: super executes normally and verification errors re-raise.
module FountainUploadGatewayDiagnostics
  private

  def verify_workhorse_api!
    return super unless params[:filename] == 'fountain-baseline-figure.png'

    sample = { event: 'FountainUploadGatewayAudit', outcome: 'entered',
               observed_at: Time.now.to_f,
               correlation_id: Labkit::Correlation::CorrelationId.current_id }
    begin
      # Unverified claims are diagnostic data only, never authorization input.
      # Token text and request/session headers must not enter the log.
      payload = JWT.decode(request.headers[Gitlab::Workhorse::INTERNAL_API_REQUEST_HEADER], nil, false).first
      issued_at = payload['iat']
      if issued_at.is_a?(Numeric) && issued_at.between?(0, 10_000_000_000)
        sample[:issued_at] = issued_at
        sample[:age_seconds] = sample[:observed_at] - issued_at
      end
      sample[:issuer_matches] = payload['iss'] == 'gitlab-workhorse'
    rescue StandardError => error
      sample[:diagnostic_decode_error] = error.class.name
    end

    begin
      result = super
      sample[:outcome] = 'verified'
      result
    rescue JWT::DecodeError => error
      sample[:outcome] = error.class.name
      raise
    ensure
      # A diagnostic logging failure cannot change the original result.
      begin
        Gitlab::AppLogger.info(sample)
      rescue StandardError
        nil
      end
    end
  end
end

Rails.application.config.after_initialize do
  Banzai::UploadsController.prepend(FountainUploadGatewayDiagnostics)
  Gitlab::AppLogger.info(event: 'FountainUploadGatewayAuditReady')
end
