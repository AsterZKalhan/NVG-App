import os
import posixpath

import paramiko

HOST = os.environ["SFTP_HOST"]
USER = os.environ["SFTP_USER"]
PASSWORD = os.environ["SFTP_PASSWORD"]
REMOTE_ROOT = "APP"

SKIP_DIRS = {".git", ".github"}
SKIP_FILES = {".gitignore", "README.md"}


def ensure_remote_dir(sftp, path):
    if path in ("", "."):
        return
    try:
        sftp.stat(path)
    except IOError:
        ensure_remote_dir(sftp, posixpath.dirname(path))
        sftp.mkdir(path)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, look_for_keys=False, allow_agent=False)
    sftp = client.open_sftp()

    count = 0
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel = os.path.relpath(root, ".").replace(os.sep, "/")
        remote_dir = REMOTE_ROOT if rel == "." else posixpath.join(REMOTE_ROOT, rel)
        ensure_remote_dir(sftp, remote_dir)
        for name in files:
            if rel == "." and name in SKIP_FILES:
                continue
            local_path = os.path.join(root, name)
            remote_path = posixpath.join(remote_dir, name)
            sftp.put(local_path, remote_path)
            count += 1
            print(f"uploaded {remote_path}")

    sftp.close()
    client.close()
    print(f"{count} fichiers envoyés (aucune suppression côté serveur)")


if __name__ == "__main__":
    main()
