#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SatisfactoryOpsRenderRig.generated.h"

class AFGBuildable;
class ASatisfactoryOpsPortHologram;
class USceneCaptureComponent2D;
class UTextureRenderTarget2D;
class UStaticMeshComponent;
class URectLightComponent;
class UCameraComponent;

UCLASS(Transient)
class SATISFACTORYOPSRENDERER_API ASatisfactoryOpsRenderRig final : public AActor
{
    GENERATED_BODY()

public:
    ASatisfactoryOpsRenderRig();
    virtual void Tick(float DeltaSeconds) override;
    bool StartFromCommandLine();

private:
    bool BuildScene();
    bool CreateTechnicalMeshes();
    bool WriteProbe() const;
    bool CaptureNextView();
    bool SaveCapture(const FString& FileName) const;
    void ConfigureTopCamera(const FBox& WorldBounds);
    void ConfigureIsoCamera(const FBox& WorldBounds, float AzimuthDegrees);
    void SetTechnicalVisible(bool bVisible);
    FBox GetWorldClearanceBounds(const AFGBuildable* Buildable) const;
    float GetLocalClearanceMinZ(const AFGBuildable* Buildable) const;
    float GetLocalClearanceMaxZ(const AFGBuildable* Buildable) const;

    UPROPERTY()
    TObjectPtr<USceneComponent> SceneRoot;
    UPROPERTY()
    TObjectPtr<USceneCaptureComponent2D> Capture;
    UPROPERTY()
    TObjectPtr<UCameraComponent> ViewCamera;
    UPROPERTY()
    TObjectPtr<UTextureRenderTarget2D> RenderTarget;
    UPROPERTY()
    TObjectPtr<URectLightComponent> KeyLight;
    UPROPERTY()
    TObjectPtr<URectLightComponent> FillLight;
    UPROPERTY()
    TObjectPtr<URectLightComponent> RimLight;
    UPROPERTY()
    TObjectPtr<AFGBuildable> Foundation;
    UPROPERTY()
    TObjectPtr<AFGBuildable> Machine;
    UPROPERTY()
    TObjectPtr<ASatisfactoryOpsPortHologram> PortHologram;
    UPROPERTY()
    TArray<TObjectPtr<UStaticMeshComponent>> TechnicalMeshes;

    FString MachineClassPath;
    FString FoundationClassPath;
    FString OutputDirectory;
    int32 Resolution = 2048;
    int32 WarmupFrames = 120;
    int32 ViewIndex = 0;
    bool bSceneBuilt = false;
    bool bProbeOnly = false;
    bool bViewportReference = false;
    bool bViewportScreenshotRequested = false;
    FBox SceneBounds;
};
