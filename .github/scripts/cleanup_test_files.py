"""Suppression ponctuelle de fichiers de test déployés par erreur.

Le déploiement SFTP ne supprime jamais de fichiers distants : ce script sert à
retirer les pages auth-test.html des trois espaces.
"""

import os

import paramiko

HOST = os.environ["SFTP_HOST"]
USER = os.environ["SFTP_USER"]
PASSWORD = os.environ["SFTP_PASSWORD"]

TARGETS = [
    "APP/auth-test.html",
    "BOT/auth-test.html",
    "tournoides9mondes/auth-test.html",
]


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, look_for_keys=False, allow_agent=False)
    sftp = client.open_sftp()

    for path in TARGETS:
        try:
            sftp.remove(path)
            print(f"supprimé {path}")
        except IOError as err:
            print(f"absent {path} ({err})")

    sftp.close()
    client.close()


if __name__ == "__main__":
    main()
