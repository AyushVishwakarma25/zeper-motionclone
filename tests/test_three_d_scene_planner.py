from app.three_d_scene_planner import ThreeDScenePlan, SceneObject, CameraShot, export_scene_plan
import pytest

def test_scene_plan_rejects_unknown_fields_and_bad_hex():
    with pytest.raises(ValueError):
        ThreeDScenePlan.model_validate({"background":"red","unexpected":"execute"})
def test_scene_plan_accepts_bounded_assets_and_shots():
    plan=ThreeDScenePlan.model_validate({
        "duration_seconds":5,
        "objects":[{"id":"card","asset":"credit_card","position":[0,1,0]}],
        "camera_shots":[{"start_frame":0,"end_frame":120,"from_shot":"wide","to_shot":"close_up"}],
    })
    exported=export_scene_plan(plan)
    assert exported["schema_version"]=="1.0"
    assert exported["camera"]["shots"][0]["end_frame"]==120
def test_scene_object_requires_three_dimensional_position():
    with pytest.raises(ValueError):
        SceneObject.model_validate({"id":"card","asset":"credit_card","position":[0,1]})
