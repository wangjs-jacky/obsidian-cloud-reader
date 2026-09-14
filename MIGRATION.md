# Private instance → multi-user site

1. Run the authentication and account-isolation tests, then verify real GitHub login → empty library → own OSS binding in a browser. Validate a second real account separately when available.
2. Deploy with fresh Library and AuthSession namespaces and a fresh encryption key. Do not copy the old global OSS_CONFIG secret or singleton object name.
3. Existing users log in and bind their own OSS, just as first-time users do. Old connection ciphertext is not portable because new ciphertext is bound to its library ID.
4. Preserve the existing private instance until the new flow is verified. Personal notes must never be copied into the source repository or a public static asset directory.
5. Publish only reviewed source. Keep deployment secrets outside the repository. Old account sessions do not transfer to the new site.
