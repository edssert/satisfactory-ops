#pragma once

#include "CoreMinimal.h"
#include "Hologram/FGBuildableHologram.h"
#include "SatisfactoryOpsPortHologram.generated.h"

UCLASS(Transient)
class SATISFACTORYOPSRENDERER_API ASatisfactoryOpsPortHologram final : public AFGBuildableHologram
{
    GENERATED_BODY()

public:
    void InitializeBuildableClass(TSubclassOf<class AFGBuildable> BuildableClass);
    class UStaticMeshComponent* GetClearanceVisualization() const;

    TArray<UStaticMeshComponent*> CreateFactoryPortMeshes(
        class UFGFactoryConnectionComponent* Connection,
        USceneComponent* AttachParent);

    TArray<UStaticMeshComponent*> CreatePowerPortMeshes(
        class UFGPowerConnectionComponent* Connection,
        USceneComponent* AttachParent);

    TArray<UStaticMeshComponent*> CreatePipePortMeshes(
        class UFGPipeConnectionComponentBase* Connection,
        USceneComponent* AttachParent);
};
