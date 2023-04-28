#!/bin/bash
cd /home/ubuntu/temp
sudo rm -rf /home/ubuntu/ttc-backend

sudo npm i --omit=dev
sudo npm i typescript
sudo /home/ubuntu/temp/node_modules/typescript/bin/tsc
cp /home/ubuntu/temp/package*.json /home/ubuntu/temp/build/
cp /home/ubuntu/.env /home/ubuntu/temp/build/
cd /home/ubuntu/temp/build/
sudo npm i --omit=dev
cd /home/ubuntu
mv /home/ubuntu/temp/build /home/ubuntu/ttc-backend
sudo rm -rf /home/ubuntu/temp/
