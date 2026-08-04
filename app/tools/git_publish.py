"""
git_publish — native tool, TDS §5 row 8. Stateless: loads a persisted
artifact from local disk (Blob Storage replacement) and pushes it to a
git remote. No live SolutionAgent needed for this step.
"""
import os
import shutil

from git import Repo

from app.config import ADM_get_settings


def ADM_push_artifact_to_git(local_artifact_path: str, repo_path: str, remote_url: str,
                              branch: str = "main", commit_message: str = "ADM: publish artifact") -> str:
    settings = ADM_get_settings()
    os.makedirs(repo_path, exist_ok=True)

    if not os.path.exists(os.path.join(repo_path, ".git")):
        repo = Repo.init(repo_path)
        if remote_url:
            repo.create_remote("origin", remote_url)
    else:
        repo = Repo(repo_path)

    dest_filename = os.path.basename(local_artifact_path)
    dest_path = os.path.join(repo_path, dest_filename)
    shutil.copy2(local_artifact_path, dest_path)

    repo.index.add([dest_filename])
    repo.index.commit(commit_message)

    try:
        repo.git.checkout("-B", branch)
    except Exception:
        pass

    if "origin" in [r.name for r in repo.remotes]:
        try:
            repo.remotes.origin.push(refspec=f"{branch}:{branch}")
        except Exception as exc:
            return f"Committed locally at {dest_path}, but push failed (check remote/creds): {exc}"

    return f"Published {dest_filename} to {repo_path} on branch {branch}"