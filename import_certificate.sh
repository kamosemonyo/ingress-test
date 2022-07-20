aws acm import-certificate --region af-south-1 \
        --certificate fileb://./certificate/certificate_body.pem \
        --certificate-chain fileb://./certificate/origin_ca_rsa_root.pem \
        --private-key fileb://./certificate/certificate_private_key.pem \
