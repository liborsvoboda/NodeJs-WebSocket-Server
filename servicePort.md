příkazy servisního portu 3300

server:restart                                       -  restartuje celý server (trva cca 1min)
start:991:55404      - start:cislo_jednotky:port     -  restartuje server naslouchání na portu
setConfigInterval:991:55404:10  - setConfigInterval:cislo_jednotky:port:pocet vteřin - nastaví časový interval zasílání konfigurace (sec, default 60, rozsah 10 - 300)), provede odpojení jednotky
sendCommand:991:55404:type:command                   - typy(ascii,hex), command příkaz, pošle příkaz na vybranou jednotku (přiklad: sendCommand:393:55876:hex:AT$TRAC=? nebo ascii : sendCommand:393:55876:ascii:&CONFGQ,0123456,2)

showSocketStatus:991:55404   - showType:cislo_jednotky:port  -  zobrazí stav socketu
showType:991:55404   - showType:cislo_jednotky:port  -  zobrazí typ jednotky
showConfigInterval:991:55404    - showConfigInterval:cislo_jednotky:port - zobrazí nastavení časového intervalu zasílání konfigurace (sec, default 60) 
server:showPorts                                     -  zobrazí seznam naslouchaných portů
server:showSockets                                   -  zobrazí seznam otevřených socketů
showSocket:991:55404   - showType:cislo_jednotky:port  -  zobrazí data socketu 
