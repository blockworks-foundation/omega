## ⚠️ Warning

Any content produced by Blockworks, or developer resources that Blockworks provides, are for educational and inspiration purposes only. Blockworks does not encourage, induce or sanction the deployment of any such applications in violation of applicable laws or regulations.


## Deployment

1. Run `yarn build` to create a build of the web frontend locally.

2. Create a backup on the server

```
ssh root@predictomega.org mv /var/www/predictomega.org /var/www/archive/predictomega.org-`date +%s`
```

3. Copy the build to the server

```
scp -r build root@predictomega.org:/var/www/predictomega.org
```

