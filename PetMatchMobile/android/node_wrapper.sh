#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20.5.0
exec /home/hornet/.nvm/versions/node/v20.5.0/bin/node "$@"
