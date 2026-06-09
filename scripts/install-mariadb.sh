#!/bin/bash

# ============================================================
# Script d'installation MariaDB pour PhysioCare
# À exécuter sur le PC SERVEUR (Linux) uniquement
# ============================================================

echo "🏥 Installation MariaDB pour PhysioCare"
echo "========================================"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Vérifier si on est root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Ce script doit être exécuté en tant que root (sudo)${NC}"
    echo "Utilisez: sudo bash install-mariadb.sh"
    exit 1
fi

# 1. Installer MariaDB
echo -e "\n${YELLOW}📦 Étape 1: Installation de MariaDB...${NC}"
apt update
apt install -y mariadb-server mariadb-client

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erreur lors de l'installation de MariaDB${NC}"
    exit 1
fi

# 2. Démarrer MariaDB
echo -e "\n${YELLOW}🚀 Étape 2: Démarrage de MariaDB...${NC}"
systemctl start mariadb
systemctl enable mariadb

# 3. Demander le mot de passe
echo -e "\n${YELLOW}🔐 Étape 3: Configuration de l'utilisateur${NC}"
read -sp "Entrez le mot de passe pour l'utilisateur 'physiocare_user': " DB_PASSWORD
echo ""

if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD="PhysioCare2024Secure!"
    echo -e "${YELLOW}⚠️ Mot de passe par défaut utilisé: $DB_PASSWORD${NC}"
fi

# 4. Créer la base et l'utilisateur
echo -e "\n${YELLOW}🗄️ Étape 4: Création de la base de données...${NC}"
mysql -u root << EOF
CREATE DATABASE IF NOT EXISTS physiocare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'physiocare_user'@'%' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON physiocare.* TO 'physiocare_user'@'%';
FLUSH PRIVILEGES;
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erreur lors de la création de la base de données${NC}"
    exit 1
fi

# 5. Configurer l'accès réseau
echo -e "\n${YELLOW}🌐 Étape 5: Configuration de l'accès réseau...${NC}"
CONFIG_FILE="/etc/mysql/mariadb.conf.d/50-server.cnf"

if [ -f "$CONFIG_FILE" ]; then
    # Backup
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    
    # Modifier bind-address
    sed -i 's/^bind-address\s*=.*/bind-address = 0.0.0.0/' "$CONFIG_FILE"
    
    echo -e "${GREEN}✅ Configuration modifiée${NC}"
else
    echo -e "${YELLOW}⚠️ Fichier de config non trouvé, vérifiez manuellement${NC}"
fi

# 6. Redémarrer MariaDB
echo -e "\n${YELLOW}🔄 Étape 6: Redémarrage de MariaDB...${NC}"
systemctl restart mariadb

# 7. Ouvrir le pare-feu
echo -e "\n${YELLOW}🔥 Étape 7: Configuration du pare-feu...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 3306/tcp
    echo -e "${GREEN}✅ Port 3306 ouvert (UFW)${NC}"
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=3306/tcp
    firewall-cmd --reload
    echo -e "${GREEN}✅ Port 3306 ouvert (firewalld)${NC}"
else
    echo -e "${YELLOW}⚠️ Pas de pare-feu détecté, continuez...${NC}"
fi

# 8. Obtenir l'IP
echo -e "\n${YELLOW}🔍 Étape 8: Recherche de l'adresse IP...${NC}"
IP_ADDRESS=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}📡 Adresse IP du serveur: ${IP_ADDRESS}${NC}"

# Résumé
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ INSTALLATION TERMINÉE AVEC SUCCÈS!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "📋 ${YELLOW}Informations de connexion:${NC}"
echo -e "   Adresse IP:    ${GREEN}$IP_ADDRESS${NC}"
echo -e "   Port:          ${GREEN}3306${NC}"
echo -e "   Base:          ${GREEN}physiocare${NC}"
echo -e "   Utilisateur:   ${GREEN}physiocare_user${NC}"
echo -e "   Mot de passe:  ${GREEN}$DB_PASSWORD${NC}"
echo ""
echo -e "${YELLOW}📝 Notez ces informations! Vous en aurez besoin pour${NC}"
echo -e "${YELLOW}   configurer l'application sur les PC clients.${NC}"
echo ""
echo -e "🧪 Pour tester: mysql -u physiocare_user -p physiocare"
echo ""
